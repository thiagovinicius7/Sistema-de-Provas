import { serverTimestamp } from 'firebase/firestore';
import { COL_RECEBIMENTOS, gravarEmLote, lerEvento, lerQuestao, lerRecebimento } from './data';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Evento, Questao, Recebimento } from './types';
import { LISTA_STATUS } from './types';
import { normalizarData, num, txt } from './util';

/** Planilha "Banco de Questões - Dados", usada pelo sistema antigo em Apps Script. */
export const ID_PLANILHA_ANTIGA = '1lg2c916pFu0HxtvIb_uofaQR3KiGxAsPEV3LU81wcNs';

export interface ResultadoImportacao {
  eventosNovos: number;
  questoesNovas: number;
  eventosJaExistiam: number;
  questoesJaExistiam: number;
  questoesSemEvento: number;
  avisos: string[];
}

function lerJsonItens(bruto: unknown, aviso: (m: string) => void, ref: string): any[] {
  const s = txt(bruto).trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    aviso(`Itens ilegíveis na questão ${ref}: ela foi importada sem os itens.`);
    return [];
  }
}

/**
 * Lê as abas Eventos e Questoes da planilha antiga e grava no Firestore.
 * Mantém os mesmos IDs. Só grava o que ainda não existe no banco novo, então
 * pode ser repetida sem apagar nada que já foi editado no sistema novo.
 */
export async function importarDaPlanilha(
  token: string,
  existentes: { eventos: Set<string>; questoes: Set<string> },
  aoProgredir?: (msg: string) => void,
): Promise<ResultadoImportacao> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${ID_PLANILHA_ANTIGA}/values:batchGet` +
    `?ranges=${encodeURIComponent('Eventos!A1:O')}&ranges=${encodeURIComponent('Questoes!A1:H')}` +
    `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  aoProgredir?.('Lendo a planilha…');
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`O Google recusou a leitura da planilha (${resp.status}). ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  const [abaEventos, abaQuestoes] = json.valueRanges as { values?: unknown[][] }[];
  const linhasEv = (abaEventos.values || []).slice(1).filter((r) => txt(r[0]).trim());
  const linhasQ = (abaQuestoes.values || []).slice(1).filter((r) => txt(r[0]).trim());

  const r: ResultadoImportacao = {
    eventosNovos: 0, questoesNovas: 0, eventosJaExistiam: 0,
    questoesJaExistiam: 0, questoesSemEvento: 0, avisos: [],
  };
  const aviso = (m: string) => r.avisos.push(m);

  const idsEventosPlanilha = new Set(linhasEv.map((l) => txt(l[0]).trim()));
  const eventos: { id: string; dados: Record<string, unknown> }[] = [];
  for (const l of linhasEv) {
    const id = txt(l[0]).trim();
    if (existentes.eventos.has(id)) { r.eventosJaExistiam++; continue; }
    const statusBruto = txt(l[4]).trim();
    const status = (LISTA_STATUS as readonly string[]).includes(statusBruto) ? statusBruto : 'Evento não iniciado';
    if (statusBruto && statusBruto !== status) aviso(`Status desconhecido "${statusBruto}" em ${txt(l[1])}: ficou "Evento não iniciado".`);
    const data = normalizarData(l[2]);
    if (!data) aviso(`Evento ${txt(l[1]) || id} sem data válida.`);
    eventos.push({
      id,
      dados: {
        titulo: txt(l[1]).trim(),
        data,
        tipo: txt(l[3]).trim().toUpperCase() === 'ME' ? 'ME' : 'CE',
        status,
        meta: num(l[5]),
        conteudo: txt(l[6]),
        link: txt(l[7]).trim(),
        cargo: txt(l[8]).trim(),
        obs: txt(l[9]),
        planejamento: txt(l[10]),
        metaF: num(l[11]),
        metaM: num(l[12]),
        metaD: num(l[13]),
        valorUnit: num(l[14]),
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        origem: 'planilha-apps-script',
      },
    });
  }

  const questoes: { id: string; dados: Record<string, unknown> }[] = [];
  for (const l of linhasQ) {
    const id = txt(l[0]).trim();
    if (existentes.questoes.has(id)) { r.questoesJaExistiam++; continue; }
    const eventoId = txt(l[1]).trim();
    if (!idsEventosPlanilha.has(eventoId) && !existentes.eventos.has(eventoId)) r.questoesSemEvento++;
    const tipo = txt(l[4]).trim().toUpperCase() === 'ME' ? 'ME' : 'CE';
    const itensBrutos = lerJsonItens(l[5], aviso, `${txt(l[2])} (${id.slice(0, 8)})`);
    const itens = itensBrutos.map((i: any) => {
      const it: Record<string, string> = {
        texto: txt(i?.texto),
        gab: txt(i?.gab).trim(),
        edital: txt(i?.edital),
        justificativa: txt(i?.justificativa),
      };
      if (tipo === 'ME') it.letra = txt(i?.letra);
      else it.dif = ['F', 'M', 'D'].includes(i?.dif) ? i.dif : '';
      return it;
    });
    const dif = txt(l[6]).trim().toUpperCase();
    questoes.push({
      id,
      dados: {
        eventoId,
        numero: num(l[2]),
        enunciado: txt(l[3]),
        tipo,
        dif: ['F', 'M', 'D'].includes(dif) ? dif : '',
        gab: txt(l[7]).trim(),
        itens,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        origem: 'planilha-apps-script',
      },
    });
  }

  r.eventosNovos = eventos.length;
  r.questoesNovas = questoes.length;
  if (eventos.length || questoes.length) {
    await gravarEmLote(eventos, questoes, (f, t) => aoProgredir?.(`Gravando ${f} de ${t}…`));
  }
  return r;
}

// ---------- Backup ----------

function semCamposDeTempo<T extends Record<string, any>>(o: T) {
  const { criadoEm, atualizadoEm, ...resto } = o;
  return resto;
}

export function gerarBackup(eventos: Evento[], questoes: Questao[], recebimentos: Recebimento[] = []) {
  return {
    recebimentos,
    sistema: 'BancoP',
    versao: 1,
    geradoEm: new Date().toISOString(),
    eventos: eventos.map(semCamposDeTempo),
    questoes: questoes.map(semCamposDeTempo),
  };
}

export function baixarArquivo(nome: string, conteudo: Blob) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Restaura um backup .json. Regrava os eventos e questões do arquivo (não apaga os outros). */
export async function restaurarBackup(conteudo: string, aoProgredir?: (msg: string) => void) {
  const b = JSON.parse(conteudo);
  if (!Array.isArray(b?.eventos) || !Array.isArray(b?.questoes)) {
    throw new Error('Este arquivo não é um backup do BancoP.');
  }
  const eventos = b.eventos
    .filter((e: any) => e?.id)
    .map((e: any) => {
      const { id, ...d } = lerEvento(String(e.id), e);
      return { id, dados: { ...semCamposDeTempo(d), atualizadoEm: serverTimestamp() } };
    });
  const questoes = b.questoes
    .filter((q: any) => q?.id)
    .map((q: any) => {
      const { id, ...d } = lerQuestao(String(q.id), q);
      return { id, dados: { ...semCamposDeTempo(d), atualizadoEm: serverTimestamp() } };
    });
  await gravarEmLote(eventos, questoes, (f, t) => aoProgredir?.(`Gravando ${f} de ${t}…`));
  const recebimentos = Array.isArray(b.recebimentos) ? b.recebimentos.filter((r: any) => r?.id) : [];
  if (recebimentos.length) {
    const lote = writeBatch(db);
    recebimentos.forEach((r: any) => {
      const { id, ...d } = lerRecebimento(String(r.id), r);
      lote.set(doc(db, COL_RECEBIMENTOS, id), d);
    });
    await lote.commit();
  }
  return { eventos: eventos.length, questoes: questoes.length, recebimentos: recebimentos.length };
}
