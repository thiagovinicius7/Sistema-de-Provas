import type { Evento, Questao, StatusEvento } from './types';

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
