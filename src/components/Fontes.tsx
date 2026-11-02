import { useMemo, useState } from 'react';
import { ChevronDown, Folder, FolderOpen, Plus, Search, X } from 'lucide-react';
import type { Evento, Questao } from '../lib/types';
import { adicionarFontes, removerFonte } from '../lib/data';
import { chaveFonte, fontesDoEvento, pastasDeFontes } from '../lib/fonte';
import { dataBR, semAcento } from '../lib/util';
import { Botao, Modal, TextoAuto, cx, estiloInput, msgErro, useAvisos } from './ui';

/**
 * Fontes dos outros eventos, uma pasta por evento. Escolher uma fonte cadastra
 * ela no evento atual (as listas dos eventos não se misturam sozinhas).
 */
export function PastasFontes({
  evento,
  eventos,
  questoes,
  aoEscolher,
  aoFechar,
}: {
  evento: Evento;
  eventos: Evento[];
  questoes: Questao[];
  aoEscolher: (fonte: string) => void;
  aoFechar: () => void;
}) {
  const { avisar } = useAvisos();
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const pastas = useMemo(() => pastasDeFontes(eventos, questoes, evento.id), [eventos, questoes, evento.id]);
  const jaTem = useMemo(
    () => new Set(fontesDoEvento(evento, questoes.filter((q) => q.eventoId === evento.id)).map(chaveFonte)),
    [evento, questoes],
  );

  const termos = semAcento(busca).split(/\s+/).filter((t) => t.length >= 2);
  const filtradas = pastas
    .map((p) => ({ ...p, fontes: termos.length ? p.fontes.filter((f) => termos.every((t) => semAcento(f).includes(t))) : p.fontes }))
    .filter((p) => p.fontes.length > 0);

  async function escolher(f: string) {
    try {
      await adicionarFontes(evento.id, [f]);
      avisar('Fonte trazida para este evento.');
      aoEscolher(f);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Fontes de outros eventos" largura="max-w-2xl">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar em todas as pastas (ex.: 9.985, Planaveg)"
          className={cx(estiloInput, 'pl-9')}
        />
      </div>
      {filtradas.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma fonte encontrada.</p>}
      <div className="grid gap-1.5">
        {filtradas.map((p) => {
          const aberta = termos.length > 0 || abertas.has(p.evento.id);
          return (
            <div key={p.evento.id} className="rounded-xl ring-1 ring-slate-200">
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                onClick={() =>
                  setAbertas((s) => {
                    const n = new Set(s);
                    n.has(p.evento.id) ? n.delete(p.evento.id) : n.add(p.evento.id);
                    return n;
                  })
                }
              >
                {aberta ? <FolderOpen className="size-4 text-amber-500" /> : <Folder className="size-4 text-amber-500" />}
                <span className="flex-1 text-sm font-semibold text-slate-800">{p.evento.titulo}</span>
                <span className="text-xs text-slate-400">{dataBR(p.evento.data)} · {p.fontes.length}</span>
                <ChevronDown className={cx('size-4 text-slate-400 transition-transform', !aberta && '-rotate-90')} />
              </button>
              {aberta && (
                <ul className="border-t border-slate-100 py-1">
                  {p.fontes.map((f) => {
                    const tem = jaTem.has(chaveFonte(f));
                    return (
                      <li key={f}>
                        <button
                          disabled={tem}
                          onClick={() => escolher(f)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs leading-snug text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Plus className="mt-0.5 size-3.5 shrink-0 text-sky-600" />
                          <span className="flex-1">{f}</span>
                          {tem && <span className="shrink-0 text-[10px] font-semibold text-emerald-700">já está neste evento</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Painel com a lista de fontes do evento: cadastrar, trazer de outro evento e remover. */
export function PainelFontes({ evento, eventos, questoes }: { evento: Evento; eventos: Evento[]; questoes: Questao[] }) {
  const { avisar } = useAvisos();
  const [nova, setNova] = useState('');
  const [pastas, setPastas] = useState(false);
  const doEvento = questoes.filter((q) => q.eventoId === evento.id);
  const lista = fontesDoEvento(evento, doEvento);
  const cadastradas = new Set(evento.fontes.map(chaveFonte));
  const usos = useMemo(() => {
    const m = new Map<string, number>();
    doEvento.forEach((q) =>
      q.itens.forEach((it) => {
        const txt = chaveFonte(it.fonte || it.justificativa || '');
        lista.forEach((f) => {
          if (txt.includes(chaveFonte(f))) m.set(f, (m.get(f) || 0) + 1);
        });
      }),
    );
    return m;
  }, [doEvento, lista]);

  async function cadastrar() {
    if (nova.trim().length < 5) return;
    try {
      await adicionarFontes(evento.id, [nova]);
      setNova('');
      avisar('Fonte cadastrada.');
    } catch (e) {
      avisar(msgErro(e), 'erro');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <TextoAuto
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          minLinhas={1}
          placeholder="Nova fonte (ex.: BRASIL. Lei nº 9.985, de 18 de julho de 2000…)"
          className="min-w-60 flex-1 bg-white text-xs"
        />
        <Botao pequeno variante="primario" onClick={cadastrar} disabled={nova.trim().length < 5}>
          <Plus className="size-4" /> Cadastrar
        </Botao>
        <Botao pequeno onClick={() => setPastas(true)}>
          <FolderOpen className="size-4" /> De outro evento
        </Botao>
      </div>
      {lista.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhuma fonte neste evento ainda.</p>
      ) : (
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto pr-1 barra-fina">
          {lista.map((f) => (
            <li key={f} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs leading-snug text-slate-700 ring-1 ring-slate-100">
              <span className="flex-1">{f}</span>
              {(usos.get(f) || 0) > 0 && (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{usos.get(f)} uso(s)</span>
              )}
              {cadastradas.has(chaveFonte(f)) && !(usos.get(f) || 0) && (
                <button
                  title="Tirar da lista do evento"
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removerFonte(evento.id, evento.fontes.find((x) => chaveFonte(x) === chaveFonte(f)) || f).catch((e) => avisar(msgErro(e), 'erro'))}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Cada evento tem a sua lista. Fontes de outros eventos ficam em pastas, em “De outro evento”.
      </p>
      {pastas && (
        <PastasFontes evento={evento} eventos={eventos} questoes={questoes} aoEscolher={() => {}} aoFechar={() => setPastas(false)} />
      )}
    </div>
  );
}
