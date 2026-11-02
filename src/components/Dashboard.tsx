import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Copy, FolderOpen, Pencil, Plus, Search } from 'lucide-react';
import type { Evento, Questao, StatusEvento } from '../lib/types';
import { LISTA_STATUS, STATUS_FINAL } from '../lib/types';
import { mudarStatus } from '../lib/data';
import { COR_STATUS, calcularProgresso, dataBR, moeda, semAcento, totalEvento } from '../lib/util';
import { Botao, cx, msgErro, useAvisos } from './ui';

export function SeletorStatus({ evento }: { evento: Evento }) {
  const { avisar } = useAvisos();
  return (
    <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <select
        value={evento.status}
        onChange={(e) =>
          mudarStatus(evento.id, e.target.value as StatusEvento)
            .then(() => avisar(`Status: ${e.target.value}`))
            .catch((er) => avisar(msgErro(er), 'erro'))
        }
        className={cx(
          'cursor-pointer appearance-none rounded-full py-1 pl-3 pr-7 text-xs font-semibold ring-1 focus:outline-none focus:ring-2',
          COR_STATUS[evento.status],
        )}
        aria-label="Status do evento"
      >
        {LISTA_STATUS.map((s) => (
          <option key={s} value={s} className="bg-white text-slate-900">{s}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 opacity-70" />
    </div>
  );
}

export function BotaoLink({ link }: { link: string }) {
  const { avisar } = useAvisos();
  if (!link) return null;
  const web = /^https?:\/\//i.test(link.trim());
  const cls = 'inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900';
  return web ? (
    <a href={link} target="_blank" rel="noopener noreferrer" className={cls} title="Abrir pasta" onClick={(e) => e.stopPropagation()}>
      <FolderOpen className="size-4" />
    </a>
  ) : (
    <button
      className={cls}
      title={`Copiar: ${link}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(link).then(() => avisar('Caminho da pasta copiado.', 'info'));
      }}
    >
      <Copy className="size-4" />
    </button>
  );
}

function CartaoEvento({ e, questoes, abrir, editar }: { e: Evento; questoes: Questao[]; abrir: () => void; editar: () => void }) {
  const p = calcularProgresso(e, questoes);
  const finalizado = e.status === STATUS_FINAL;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(k) => k.key === 'Enter' && abrir()}
      className={cx(
        'group cursor-pointer rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md hover:ring-slate-300',
        finalizado && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{e.titulo || 'Sem título'}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">{e.tipo}</span>
          </div>
          {e.cargo && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{e.cargo}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <BotaoLink link={e.link} />
          <button
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Editar evento"
            onClick={(ev) => { ev.stopPropagation(); editar(); }}
          >
            <Pencil className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{dataBR(e.data)}</span>
        <span>Meta {e.meta || 0}</span>
        <span className="font-semibold text-emerald-700">{moeda(totalEvento(e))}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cx('h-full rounded-full', p.pct >= 100 ? 'bg-emerald-500' : 'bg-slate-800')} style={{ width: `${p.pct}%` }} />
        </div>
        <span className="w-16 text-right text-xs font-medium tabular-nums text-slate-600">{p.total}/{p.meta}</span>
      </div>

      <div className="mt-3">
        <SeletorStatus evento={e} />
      </div>
    </div>
  );
}

export default function Dashboard({
  eventos,
  questoes,
  abrirEvento,
  editarEvento,
  novoEvento,
}: {
  eventos: Evento[];
  questoes: Questao[];
  abrirEvento: (id: string) => void;
  editarEvento: (e: Evento) => void;
  novoEvento: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [verFinalizados, setVerFinalizados] = useState(false);

  const porEvento = useMemo(() => {
    const m = new Map<string, Questao[]>();
    questoes.forEach((q) => m.set(q.eventoId, [...(m.get(q.eventoId) || []), q]));
    return m;
  }, [questoes]);

  const filtrados = useMemo(() => {
    const b = semAcento(busca.trim());
    const lista = [...eventos].sort((a, c) => (a.data || '9999').localeCompare(c.data || '9999'));
    return b ? lista.filter((e) => semAcento(`${e.titulo} ${e.cargo} ${e.status}`).includes(b)) : lista;
  }, [eventos, busca]);

  const ativos = filtrados.filter((e) => e.status !== STATUS_FINAL);
  const finalizados = filtrados.filter((e) => e.status === STATUS_FINAL).reverse();

  const ano = new Date().getFullYear();
  const emAberto = eventos.filter((e) => e.status !== STATUS_FINAL).reduce((s, e) => s + totalEvento(e), 0);
  const aguardandoPgto = eventos.filter((e) => e.status === 'Esperando pagamento').reduce((s, e) => s + totalEvento(e), 0);
  const recebidoAno = eventos
    .filter((e) => e.status === STATUS_FINAL && e.data.startsWith(String(ano)))
    .reduce((s, e) => s + totalEvento(e), 0);

  const lista = (es: Evento[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {es.map((e) => (
        <CartaoEvento key={e.id} e={e} questoes={porEvento.get(e.id) || []} abrir={() => abrirEvento(e.id)} editar={() => editarEvento(e)} />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { r: 'Eventos ativos', v: String(eventos.filter((e) => e.status !== STATUS_FINAL).length) },
          { r: 'Em andamento', v: moeda(emAberto) },
          { r: 'Esperando pagamento', v: moeda(aguardandoPgto) },
          { r: `Finalizados em ${ano}`, v: moeda(recebidoAno) },
        ].map((k) => (
          <div key={k.r} className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.r}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, cargo ou status"
            className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <Botao variante="primario" onClick={novoEvento}>
          <Plus className="size-4" /> <span className="hidden sm:inline">Novo evento</span>
        </Botao>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Ativos <span className="text-slate-400">({ativos.length})</span></h2>
      {ativos.length ? lista(ativos) : (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {busca ? 'Nenhum evento ativo encontrado.' : 'Nenhum evento ativo. Crie um em “Novo evento”.'}
        </div>
      )}

      <button
        onClick={() => setVerFinalizados((v) => !v)}
        className="mb-3 mt-8 flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
      >
        <ChevronDown className={cx('size-4 transition-transform', !verFinalizados && '-rotate-90')} />
        Finalizados <span className="text-slate-400">({finalizados.length})</span>
      </button>
      {(verFinalizados || (busca && finalizados.length > 0)) && lista(finalizados)}

    </div>
  );
}
