import type { Evento, Questao, StatusEvento } from './types';
import { STATUS_FINAL } from './types';

export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** yyyy-mm-dd -> dd/mm/aaaa */
export function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || 'Sem data';
}

/** Aceita yyyy-mm-dd, dd/mm/aaaa ou número de série do Sheets. Devolve yyyy-mm-dd ou ''. */
export function normalizarData(v: unknown): string {
  if (typeof v === 'number' && v > 0) {
    // Série do Sheets: dias desde 30/12/1899.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = txt(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function totalEvento(e: Evento): number {
  return (e.meta || 0) * (e.valorUnit || 0);
}

export const COR_STATUS: Record<StatusEvento, string> = {
  'Evento não iniciado': 'bg-slate-100 text-slate-700 ring-slate-300',
  'Em elaboração': 'bg-amber-50 text-amber-800 ring-amber-300',
  'Entrega realizada': 'bg-sky-50 text-sky-800 ring-sky-300',
  'Liberação feita': 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  'Recursos respondidos': 'bg-rose-50 text-rose-800 ring-rose-300',
  'Esperando pagamento': 'bg-yellow-100 text-yellow-900 ring-yellow-400',
  'Evento finalizado': 'bg-emerald-600 text-white ring-emerald-600',
};

export interface Progresso {
  total: number;
  meta: number;
  pct: number;
  f: number;
  m: number;
  d: number;
  semDif: number;
  alvoF: number;
  alvoM: number;
  alvoD: number;
}

/** Mesma conta do sistema antigo: ME conta questões, CE conta itens. */
export function calcularProgresso(evento: Evento, questoes: Questao[]): Progresso {
  const meta = evento.meta > 0 ? evento.meta : 0;
  let total = 0, f = 0, m = 0, d = 0, semDif = 0;
  const conta = (dif?: string) => {
    if (dif === 'F') f++;
    else if (dif === 'M') m++;
    else if (dif === 'D') d++;
    else semDif++;
  };
  if (evento.tipo === 'ME') {
    total = questoes.length;
    questoes.forEach((q) => conta(q.dif));
  } else {
    questoes.forEach((q) => (q.itens || []).forEach((it) => { total++; conta(it.dif); }));
  }
  const base = meta || 1;
  return {
    total,
    meta,
    pct: meta ? Math.min(100, Math.round((total / base) * 100)) : 0,
    f, m, d, semDif,
    alvoF: Math.round(meta * (evento.metaF / 100)),
    alvoM: Math.round(meta * (evento.metaM / 100)),
    alvoD: Math.round(meta * (evento.metaD / 100)),
  };
}

export function ordenarQuestoes(qs: Questao[]): Questao[] {
  return [...qs].sort((a, b) => a.numero - b.numero);
}

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- Prazos e pagamento ----------

/** Data de hoje no fuso do aparelho, yyyy-mm-dd. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}

export interface Prazo {
  dias: number;
  texto: string;
  nivel: 'atrasado' | 'urgente' | 'perto' | 'ok';
}

/** Prazo de entrega: só conta enquanto a prova não foi entregue. */
export function prazoEvento(e: Evento, hoje = hojeISO()): Prazo | null {
  if (!e.data || !['Evento não iniciado', 'Em elaboração'].includes(e.status)) return null;
  const dias = diasEntre(hoje, e.data);
  if (dias < 0) return { dias, texto: `Atrasado ${-dias} dia${dias === -1 ? '' : 's'}`, nivel: 'atrasado' };
  if (dias === 0) return { dias, texto: 'Entrega hoje', nivel: 'urgente' };
  if (dias === 1) return { dias, texto: 'Entrega amanhã', nivel: 'urgente' };
  return { dias, texto: `Faltam ${dias} dias`, nivel: dias <= 3 ? 'urgente' : dias <= 7 ? 'perto' : 'ok' };
}

export const COR_PRAZO: Record<Prazo['nivel'], string> = {
  atrasado: 'bg-rose-600 text-white',
  urgente: 'bg-rose-100 text-rose-800',
  perto: 'bg-amber-100 text-amber-800',
  ok: 'bg-slate-100 text-slate-600',
};

/**
 * Quanto entrou e quando. Eventos finalizados antes do registro de pagamento
 * existir contam pelo total previsto, na data do evento.
 */
export function recebimento(e: Evento): { valor: number; data: string; registrado: boolean } | null {
  if (e.valorRecebido !== null) return { valor: e.valorRecebido, data: e.dataPagamento || e.data, registrado: true };
  if (e.status === STATUS_FINAL) return { valor: totalEvento(e), data: e.data, registrado: false };
  return null;
}
