import { useMemo, useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import type { Evento, Questao } from '../lib/types';
import { calcularCobertura, extrairTopicos, topicosDoEvento } from '../lib/edital';
import { salvarTopicos } from '../lib/data';
import { Botao, TextoAuto, cx, msgErro, useAvisos } from './ui';

/** Painel que mostra quais tópicos do edital já têm questão e quais faltam. */
export default function Cobertura({
  evento,
  questoes,
  abrirQuestao,
}: {
  evento: Evento;
  questoes: Questao[];
  abrirQuestao: (numero: number) => void;
}) {
  const { avisar, confirmar } = useAvisos();
  const topicos = useMemo(() => topicosDoEvento(evento), [evento.topicos, evento.conteudo]); // eslint-disable-line
  const c = useMemo(() => calcularCobertura(evento, questoes, topicos), [evento, questoes, topicos]);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [soFaltando, setSoFaltando] = useState(false);

  const manual = evento.topicos.length > 0;

  async function salvar(lista: string[]) {
    setSalvando(true);
    try {
      await salvarTopicos(evento.id, lista);
      avisar('Tópicos salvos.');
      setEditando(false);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <div>
        <p className="mb-2 text-xs text-slate-600">
          Um tópico por linha. Comece com o número (ex.: <code>1.2 Usos permitidos…</code>) para o sistema reconhecer itens que citam só o número.
        </p>
        <TextoAuto value={texto} onChange={(e) => setTexto(e.target.value)} minLinhas={8} className="bg-white font-mono text-xs" />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {manual && (
            <Botao
              pequeno
              variante="fantasma"
              onClick={async () => {
                if (await confirmar({ titulo: 'Voltar à lista automática?', msg: 'A lista editada é descartada e os tópicos voltam a ser lidos do conteúdo do edital.', botao: 'Voltar' }))
                  salvar([]);
              }}
            >
              <RotateCcw className="size-3.5" /> Lista automática
            </Botao>
          )}
          <Botao pequeno variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Botao>
          <Botao
            pequeno
            variante="primario"
            carregando={salvando}
            onClick={() => salvar(texto.split('\n').map((l) => l.trim()).filter(Boolean))}
          >
            Salvar tópicos
          </Botao>
        </div>
      </div>
    );
  }

  const linhas = soFaltando ? c.linhas.filter((l) => l.total === 0) : c.linhas;
  const pct = c.linhas.length ? Math.round((c.cobertos / c.linhas.length) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-sm text-slate-700">
          <b className="text-slate-900">{c.cobertos}</b> de {c.linhas.length} tópicos com questão
          <span className="ml-1 text-slate-500">({pct}%)</span>
        </div>
        {c.semEdital > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            {c.semEdital} {c.unidade} sem edital preenchido
          </span>
        )}
        {c.semTopico > 0 && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            {c.semTopico} itens com edital fora da lista
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" className="accent-slate-900" checked={soFaltando} onChange={(e) => setSoFaltando(e.target.checked)} />
            Só os que faltam
          </label>
          <Botao
            pequeno
            variante="secundario"
            onClick={() => {
              setTexto((manual ? evento.topicos : extrairTopicos(evento.conteudo).map((t) => t.linha)).join('\n'));
              setEditando(true);
            }}
          >
            <Pencil className="size-3.5" /> Tópicos
          </Botao>
        </div>
      </div>

      {c.linhas.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum tópico encontrado. Preencha o conteúdo do edital no evento ou cadastre os tópicos em “Tópicos”.
        </p>
      ) : (
        <ul className="max-h-[55vh] space-y-0.5 overflow-y-auto pr-1 barra-fina">
          {linhas.map((l) => (
            <li
              key={l.topico.linha}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/70"
              style={{ paddingLeft: 8 + l.topico.nivel * 16 }}
            >
              <span
                className={cx(
                  'mt-0.5 inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums',
                  l.total === 0 ? 'bg-rose-100 text-rose-700' : l.direto === 0 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-emerald-600 text-white',
                )}
                title={l.direto !== l.total ? `${l.direto} direto, ${l.total} contando os subtópicos` : undefined}
              >
                {l.total}
              </span>
              <span className={cx('flex-1 text-sm leading-snug', l.total === 0 ? 'text-slate-700' : 'text-slate-500')}>
                {l.topico.codigo && <b className="mr-1 text-slate-900">{l.topico.codigo}</b>}
                {l.topico.texto}
                {l.numeros.length > 0 && (
                  <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                    {l.numeros.map((n) => (
                      <button
                        key={n}
                        onClick={() => abrirQuestao(n)}
                        className="rounded bg-white px-1.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-900 hover:text-white"
                        title={`Abrir questão ${n}`}
                      >
                        Q{n}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Contagem em {c.unidade}. {manual ? 'Lista de tópicos editada à mão.' : 'Tópicos lidos automaticamente do conteúdo do edital.'}
      </p>
    </div>
  );
}
