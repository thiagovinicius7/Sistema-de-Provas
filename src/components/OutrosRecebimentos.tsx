import { useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Recebimento } from '../lib/types';
import { excluirRecebimento, salvarRecebimento } from '../lib/data';
import { dataBR, hojeISO, moeda, num } from '../lib/util';
import { Botao, Campo, Modal, Valor, cx, estiloInput, msgErro, useAvisos } from './ui';

type Form = { id: string | null; data: string; descricao: string; horas: string; valor: string };

/** Entradas que não são pagamento de prova, como horas de trabalho presencial. */
export default function OutrosRecebimentos({ lista }: { lista: Recebimento[] }) {
  const { avisar, confirmar } = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ordenada = [...lista].sort((a, b) => b.data.localeCompare(a.data));
  const total = lista.reduce((s, r) => s + r.valor, 0);

  async function salvar() {
    if (!f) return;
    if (!f.data) return avisar('Informe a data.', 'erro');
    if (!num(f.valor)) return avisar('Informe o valor recebido.', 'erro');
    setSalvando(true);
    try {
      await salvarRecebimento(f.id, {
        data: f.data,
        descricao: f.descricao || 'Trabalho presencial',
        horas: f.horas === '' ? null : num(f.horas),
        valor: num(f.valor),
      });
      avisar(f.id ? 'Recebimento atualizado.' : 'Recebimento registrado.');
      setF(null);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(r: Recebimento) {
    if (!(await confirmar({ titulo: 'Excluir recebimento?', msg: `${dataBR(r.data)} · ${moeda(r.valor)}`, botao: 'Excluir', perigo: true }))) return;
    try {
      await excluirRecebimento(r.id);
      avisar('Recebimento excluído.');
    } catch (e) {
      avisar(msgErro(e), 'erro');
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900">
          <ChevronDown className={cx('size-4 transition-transform', !aberto && '-rotate-90')} />
          Outros recebimentos <span className="text-slate-400">({lista.length})</span>
        </button>
        {lista.length > 0 && <span className="text-xs text-slate-500">· <Valor>{moeda(total)}</Valor></span>}
        <Botao
          pequeno
          variante="fantasma"
          className="ml-auto"
          onClick={() => setF({ id: null, data: hojeISO(), descricao: 'Trabalho presencial', horas: '', valor: '' })}
        >
          <Plus className="size-4" /> Adicionar
        </Botao>
      </div>

      {aberto && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70">
          {ordenada.length === 0 && (
            <p className="p-5 text-center text-sm text-slate-500">Horas de trabalho presencial e outras entradas que não são de prova.</p>
          )}
          {ordenada.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <div className="w-20 shrink-0 text-xs font-medium tabular-nums text-slate-500">{dataBR(r.data)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-800">{r.descricao}</div>
                {r.horas !== null && <div className="text-xs text-slate-500">{r.horas} h</div>}
              </div>
              <Valor className="text-sm font-semibold tabular-nums text-emerald-700">{moeda(r.valor)}</Valor>
              <button
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                title="Editar"
                onClick={() => setF({ id: r.id, data: r.data, descricao: r.descricao, horas: r.horas === null ? '' : String(r.horas), valor: String(r.valor) })}
              >
                <Pencil className="size-4" />
              </button>
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir(r)}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={!!f}
        aoFechar={() => setF(null)}
        titulo={f?.id ? 'Editar recebimento' : 'Outro recebimento'}
        largura="max-w-sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setF(null)}>Cancelar</Botao>
            <Botao variante="sucesso" onClick={salvar} carregando={salvando}>Salvar</Botao>
          </>
        }
      >
        {f && (
          <div className="grid gap-3">
            <Campo rotulo="Descrição">
              <input className={estiloInput} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Data" className="col-span-3 sm:col-span-1">
                <input type="date" className={estiloInput} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
              </Campo>
              <Campo rotulo="Horas" dica="opcional">
                <input type="number" inputMode="decimal" min={0} step="0.5" className={estiloInput} value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} />
              </Campo>
              <Campo rotulo="Valor (R$)" className="col-span-2 sm:col-span-1">
                <input type="number" inputMode="decimal" min={0} step="0.01" className={estiloInput} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
              </Campo>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
