import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Evento, EventoDados, Item, Questao, QuestaoDados, Recebimento, StatusEvento } from './types';
import { LISTA_STATUS } from './types';
import { num, txt, normalizarData } from './util';

export const COL_EVENTOS = 'eventos';
export const COL_QUESTOES = 'questoes';
export const COL_RECEBIMENTOS = 'recebimentos';

// ---------- Leitura defensiva (nunca quebra a tela com dado incompleto) ----------

export function lerEvento(id: string, d: any): Evento {
  const status = LISTA_STATUS.includes(d?.status) ? (d.status as StatusEvento) : 'Evento não iniciado';
  return {
    id,
    titulo: txt(d?.titulo),
    cargo: txt(d?.cargo),
    data: normalizarData(d?.data),
    tipo: d?.tipo === 'ME' ? 'ME' : 'CE',
    status,
    meta: num(d?.meta),
    valorUnit: num(d?.valorUnit),
    metaF: num(d?.metaF),
    metaM: num(d?.metaM),
    metaD: num(d?.metaD),
    link: txt(d?.link),
    conteudo: txt(d?.conteudo),
    obs: txt(d?.obs),
    planejamento: txt(d?.planejamento),
    topicos: Array.isArray(d?.topicos) ? d.topicos.map(txt).filter(Boolean) : [],
    fontes: Array.isArray(d?.fontes) ? d.fontes.map(txt).filter(Boolean) : [],
    valorRecebido: d?.valorRecebido === null || d?.valorRecebido === undefined || d?.valorRecebido === '' ? null : num(d.valorRecebido),
    dataPagamento: normalizarData(d?.dataPagamento),
    criadoEm: d?.criadoEm,
    atualizadoEm: d?.atualizadoEm,
  };
}

function lerItem(i: any): Item {
  const it: Item = {
    texto: txt(i?.texto),
    gab: txt(i?.gab),
    edital: txt(i?.edital),
    justificativa: txt(i?.justificativa),
  };
  if (i?.fonte) it.fonte = txt(i.fonte);
  if (i?.letra) it.letra = txt(i.letra);
  if (i?.dif !== undefined) it.dif = (['F', 'M', 'D'].includes(i.dif) ? i.dif : '') as Item['dif'];
  return it;
}

export function lerQuestao(id: string, d: any): Questao {
  return {
    id,
    eventoId: txt(d?.eventoId),
    numero: num(d?.numero),
    enunciado: txt(d?.enunciado),
    tipo: d?.tipo === 'ME' ? 'ME' : 'CE',
    dif: (['F', 'M', 'D'].includes(d?.dif) ? d.dif : '') as Questao['dif'],
    gab: txt(d?.gab),
    itens: Array.isArray(d?.itens) ? d.itens.map(lerItem) : [],
    criadoEm: d?.criadoEm,
    atualizadoEm: d?.atualizadoEm,
  };
}

// ---------- Tempo real ----------

export function ouvirEventos(cb: (e: Evento[]) => void, erro: (e: Error) => void) {
  return onSnapshot(
    collection(db, COL_EVENTOS),
    (snap) => cb(snap.docs.map((d) => lerEvento(d.id, d.data()))),
    erro,
  );
}

export function ouvirQuestoes(cb: (q: Questao[]) => void, erro: (e: Error) => void) {
  return onSnapshot(
    collection(db, COL_QUESTOES),
    (snap) => cb(snap.docs.map((d) => lerQuestao(d.id, d.data()))),
    erro,
  );
}

// ---------- Gravação ----------

function limparItem(i: Item, tipo: 'CE' | 'ME'): Item {
  const it: Item = {
    texto: i.texto || '',
    gab: (i.gab || '').trim(),
    edital: i.edital || '',
    justificativa: (i.justificativa || '').trim(),
    fonte: (i.fonte || '').trim(),
  };
  if (tipo === 'ME') it.letra = i.letra || '';
  else it.dif = i.dif || '';
  return it;
}

export async function salvarEvento(id: string | null, dados: EventoDados): Promise<string> {
  const ref = id ? doc(db, COL_EVENTOS, id) : doc(collection(db, COL_EVENTOS));
  const payload = {
    titulo: dados.titulo.trim(),
    cargo: dados.cargo.trim(),
    data: dados.data,
    tipo: dados.tipo,
    meta: num(dados.meta),
    valorUnit: num(dados.valorUnit),
    metaF: num(dados.metaF),
    metaM: num(dados.metaM),
    metaD: num(dados.metaD),
    link: dados.link.trim(),
    conteudo: dados.conteudo,
    obs: dados.obs,
    valorRecebido: dados.valorRecebido === null ? null : num(dados.valorRecebido),
    dataPagamento: dados.valorRecebido === null ? '' : dados.dataPagamento || '',
    atualizadoEm: serverTimestamp(),
  };
  if (id) {
    // Status e planejamento têm caminhos próprios e não são tocados aqui.
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, {
      ...payload,
      status: 'Evento não iniciado',
      planejamento: '',
      topicos: [],
      fontes: [],
      criadoEm: serverTimestamp(),
    });
  }
  return ref.id;
}

export function mudarStatus(id: string, status: StatusEvento) {
  return updateDoc(doc(db, COL_EVENTOS, id), { status, atualizadoEm: serverTimestamp() });
}

/** Cadastra fontes na lista do evento (sem repetir). */
export function adicionarFontes(id: string, fontes: string[]) {
  const lista = fontes.map((f) => f.replace(/\s+/g, ' ').trim()).filter((f) => f.length >= 5);
  if (!lista.length) return Promise.resolve();
  return updateDoc(doc(db, COL_EVENTOS, id), { fontes: arrayUnion(...lista), atualizadoEm: serverTimestamp() });
}

export function removerFonte(id: string, fonte: string) {
  return updateDoc(doc(db, COL_EVENTOS, id), { fontes: arrayRemove(fonte), atualizadoEm: serverTimestamp() });
}

export function salvarTopicos(id: string, topicos: string[]) {
  return updateDoc(doc(db, COL_EVENTOS, id), { topicos, atualizadoEm: serverTimestamp() });
}

export function registrarPagamento(id: string, valorRecebido: number | null, dataPagamento: string) {
  return updateDoc(doc(db, COL_EVENTOS, id), {
    valorRecebido,
    dataPagamento: valorRecebido === null ? '' : dataPagamento,
    atualizadoEm: serverTimestamp(),
  });
}

export function salvarPlanejamento(id: string, planejamento: string) {
  return updateDoc(doc(db, COL_EVENTOS, id), { planejamento, atualizadoEm: serverTimestamp() });
}

/** Apaga o evento e todas as questões dele. */
export async function excluirEvento(id: string) {
  const qs = await getDocs(query(collection(db, COL_QUESTOES), where('eventoId', '==', id)));
  const refs = [...qs.docs.map((d) => d.ref), doc(db, COL_EVENTOS, id)];
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}

export async function salvarQuestao(id: string | null, dados: QuestaoDados): Promise<string> {
  const ref = id ? doc(db, COL_QUESTOES, id) : doc(collection(db, COL_QUESTOES));
  const payload = {
    eventoId: dados.eventoId,
    numero: num(dados.numero),
    enunciado: dados.enunciado,
    tipo: dados.tipo,
    dif: dados.tipo === 'ME' ? dados.dif || '' : '',
    gab: dados.tipo === 'ME' ? (dados.gab || '').trim() : '',
    itens: dados.itens.map((i) => limparItem(i, dados.tipo)),
    atualizadoEm: serverTimestamp(),
  };
  if (id) await updateDoc(ref, payload);
  else await setDoc(ref, { ...payload, criadoEm: serverTimestamp() });
  return ref.id;
}

export function excluirQuestao(id: string) {
  return deleteDoc(doc(db, COL_QUESTOES, id));
}

// ---------- Gravação em lote (importação e restauração de backup) ----------

export async function gravarEmLote(
  eventos: { id: string; dados: Record<string, unknown> }[],
  questoes: { id: string; dados: Record<string, unknown> }[],
  aoProgredir?: (feitos: number, total: number) => void,
) {
  const tudo = [
    ...eventos.map((e) => ({ ref: doc(db, COL_EVENTOS, e.id), dados: e.dados })),
    ...questoes.map((q) => ({ ref: doc(db, COL_QUESTOES, q.id), dados: q.dados })),
  ];
  for (let i = 0; i < tudo.length; i += 300) {
    const b = writeBatch(db);
    tudo.slice(i, i + 300).forEach((x) => b.set(x.ref, x.dados));
    await b.commit();
    aoProgredir?.(Math.min(i + 300, tudo.length), tudo.length);
  }
}

// ---------- Outros recebimentos ----------

export function lerRecebimento(id: string, d: any): Recebimento {
  return {
    id,
    data: normalizarData(d?.data),
    descricao: txt(d?.descricao),
    horas: d?.horas === null || d?.horas === undefined || d?.horas === '' ? null : num(d.horas),
    valor: num(d?.valor),
  };
}

export function ouvirRecebimentos(cb: (r: Recebimento[]) => void, erro: (e: Error) => void) {
  return onSnapshot(
    collection(db, COL_RECEBIMENTOS),
    (snap) => cb(snap.docs.map((d) => lerRecebimento(d.id, d.data()))),
    erro,
  );
}

export async function salvarRecebimento(id: string | null, r: Omit<Recebimento, 'id'>) {
  const ref = id ? doc(db, COL_RECEBIMENTOS, id) : doc(collection(db, COL_RECEBIMENTOS));
  await setDoc(ref, {
    data: r.data,
    descricao: r.descricao.trim(),
    horas: r.horas,
    valor: num(r.valor),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export function excluirRecebimento(id: string) {
  return deleteDoc(doc(db, COL_RECEBIMENTOS, id));
}
