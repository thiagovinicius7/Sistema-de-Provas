import type { Evento, Questao } from './types';
import { semAcento } from './util';

export interface Topico {
  /** "1.2", ou '' quando o edital não é numerado. */
  codigo: string;
  texto: string;
  /** Linha completa, como aparece na lista e no campo do item. */
  linha: string;
  nivel: number;
}

const MARCADOR = /(?:^|[\s.:;])(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇÀ])/g;

function limpar(s: string) {
  return s.replace(/\s+/g, ' ').replace(/[\s.;,:–—-]+$/, '').trim();
}

/** Divide por ";" e por fim de frase, sem quebrar o que está entre parênteses. */
function dividirTexto(s: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let prof = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') prof++;
    if (c === ')') prof = Math.max(0, prof - 1);
    const fimFrase = c === '.' && /\s/.test(s[i + 1] || '') && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(s.slice(i + 1).trim()[0] || '');
    if (prof === 0 && (c === ';' || fimFrase)) {
      partes.push(atual);
      atual = '';
    } else atual += c;
  }
  partes.push(atual);
  return partes.map(limpar).filter((p) => p.length >= 4);
}

/** Separa o conteúdo do edital em tópicos. */
export function extrairTopicos(conteudo: string): Topico[] {
  const texto = (conteudo || '').replace(/\r/g, '');
  const plano = texto.replace(/\s+/g, ' ');

  // 1) Edital numerado: "1 Tema. 1.1 Subtema. 1.2 …"
  const marcas = [...plano.matchAll(MARCADOR)].map((m) => ({
    codigo: m[1],
    inicio: m.index! + m[0].length,
    fimAnterior: m.index! + (m[0].length - m[0].trimStart().length),
  }));
  if (marcas.length >= 2) {
    const brutos = marcas.map((m, i) => ({
      codigo: m.codigo,
      texto: limpar(plano.slice(m.inicio, i + 1 < marcas.length ? marcas[i + 1].fimAnterior : undefined)),
    }));
    // Títulos em caixa-alta ("MEIO AMBIENTE…:") não são tópicos; códigos repetidos ficam com o último.
    const porCodigo = new Map<string, string>();
    brutos
      .filter((t) => t.texto && /[a-zà-ú]/.test(t.texto))
      .forEach((t) => {
        porCodigo.delete(t.codigo);
        porCodigo.set(t.codigo, t.texto);
      });
    const lista = [...porCodigo].map(([codigo, t]) => criar(`${codigo} ${t}`));
    if (lista.length >= 2) return lista;
  }

  // 2) Edital em blocos separados por linha em branco.
  const blocos = texto.split(/\n\s*\n/).map(limpar).filter(Boolean);
  if (blocos.length >= 2) return blocos.map(criar);

  // 3) Edital corrido: separa por ";" e por frase.
  return dividirTexto(texto).map(criar);
}

export function criar(linha: string): Topico {
  const l = limpar(linha);
  const m = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(.+)$/.exec(l);
  return m
    ? { codigo: m[1], texto: m[2], linha: l, nivel: m[1].split('.').length - 1 }
    : { codigo: '', texto: l, linha: l, nivel: 0 };
}

/** Lista que vale para o evento: a editada à mão, ou a extraída do edital. */
export function topicosDoEvento(e: Evento): Topico[] {
  if (e.topicos && e.topicos.length) return e.topicos.map(criar).filter((t) => t.linha);
  return extrairTopicos(e.conteudo);
}

// ---------- Cobertura ----------

const PALAVRAS_VAZIAS = new Set(['para', 'como', 'pelo', 'pela', 'suas', 'seus', 'entre', 'sobre', 'com', 'dos', 'das', 'nos', 'nas', 'que', 'uma', 'por', 'and']);

function palavras(s: string): string[] {
  return semAcento(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
}

function normal(s: string) {
  return palavras(s).join(' ');
}

/** Tópicos citados no campo "edital" de um item. */
export function topicosCitados(edital: string, topicos: Topico[]): Topico[] {
  const e = (edital || '').trim();
  if (!e) return [];

  // Por número: "1.2", "2.5 —", "8.11"… (sem confundir 8.1 com 8.11 nem com "Lei nº 9.985").
  const porCodigo = topicos.filter((t) => {
    if (!t.codigo) return false;
    const c = t.codigo.replace(/\./g, '\\.');
    return new RegExp(`(^|[^\\d.,/])${c}(?!\\d|\\.\\d|/|,\\d)`).test(e);
  });
  if (porCodigo.length) return porCodigo;

  // Por texto: o item copiou (parte de) um tópico.
  const ne = normal(e);
  if (ne.length < 12) return [];
  const contem = topicos.filter((t) => {
    const nt = normal(t.texto);
    return nt.length >= 12 && (ne.includes(nt) || nt.includes(ne));
  });
  if (contem.length) return contem;

  const pe = new Set(palavras(e));
  let melhor: Topico | null = null;
  let nota = 0;
  for (const t of topicos) {
    const pt = palavras(t.texto);
    if (!pt.length) continue;
    const comuns = pt.filter((p) => pe.has(p)).length;
    const n = comuns / Math.min(pe.size, pt.length);
    if (n > nota) { nota = n; melhor = t; }
  }
  return melhor && nota >= 0.6 ? [melhor] : [];
}

export interface LinhaCobertura {
  topico: Topico;
  /** Questões (ME) ou itens (CE) que citam este tópico. */
  direto: number;
  /** Inclui os subtópicos (1 conta também o que é de 1.1, 1.2…). */
  total: number;
  numeros: number[];
}

export interface Cobertura {
  linhas: LinhaCobertura[];
  cobertos: number;
  semEdital: number;
  semTopico: number;
  unidade: 'questões' | 'itens';
}

export function calcularCobertura(evento: Evento, questoes: Questao[], topicos = topicosDoEvento(evento)): Cobertura {
  const ME = evento.tipo === 'ME';
  const direto = new Map<string, Set<string>>();
  const numeros = new Map<string, Set<number>>();
  let semEdital = 0;
  let semTopico = 0;

  for (const q of questoes) {
    q.itens.forEach((it, k) => {
      const chaveUnidade = ME ? q.id : `${q.id}#${k}`;
      if (!it.edital?.trim()) { semEdital++; return; }
      const citados = topicosCitados(it.edital, topicos);
      if (!citados.length) semTopico++;
      citados.forEach((t) => {
        if (!direto.has(t.linha)) { direto.set(t.linha, new Set()); numeros.set(t.linha, new Set()); }
        direto.get(t.linha)!.add(chaveUnidade);
        numeros.get(t.linha)!.add(q.numero);
      });
    });
  }

  const linhas = topicos.map((t) => {
    const prop = direto.get(t.linha) || new Set<string>();
    const tudo = new Set(prop);
    const nums = new Set(numeros.get(t.linha) || []);
    if (t.codigo) {
      topicos
        .filter((f) => f.codigo.startsWith(t.codigo + '.'))
        .forEach((f) => {
          direto.get(f.linha)?.forEach((x) => tudo.add(x));
          numeros.get(f.linha)?.forEach((x) => nums.add(x));
        });
    }
    return { topico: t, direto: prop.size, total: tudo.size, numeros: [...nums].sort((a, b) => a - b) };
  });

  return {
    linhas,
    cobertos: linhas.filter((l) => l.total > 0).length,
    semEdital: ME ? new Set(questoes.filter((q) => q.itens.every((i) => !i.edital?.trim())).map((q) => q.id)).size : semEdital,
    semTopico,
    unidade: ME ? 'questões' : 'itens',
  };
}
