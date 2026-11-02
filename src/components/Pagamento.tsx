import { useEffect, useState } from 'react';
import type { Evento } from '../lib/types';
import { registrarPagamento } from '../lib/data';
import { hojeISO, moeda, num, totalEvento } from '../lib/util';
import { Botao, Campo, Modal, estiloInput, msgErro, useAvisos } from './ui';

/** Registra quanto foi recebido e quando. Abre sozinho ao finalizar um evento sem pagamento registrado. */
export default function Pagamento({ evento, aoFechar }: { evento: Evento | null; aoFechar: () => void }) {
  const { avisar } = useAvisos();
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!evento) return;
    setValor(String(evento.valorRecebido ?? totalEvento(evento)));
    setData(evento.dataPagamento || hojeISO());
  }, [evento]);

  if (!evento) return null;
  const previsto = totalEvento(evento);
  const diferenca = num(valor) - previsto;

  async function salvar(registrar: boolean) {
    if (!evento) return;
    setSalvando(true);
    try {
      await registrarPagamento(evento.id, registrar ? num(valor) : null, registrar ? data : '');
      avisar(registrar ? 'Pagamento registrado.' : 'Registro de pagamento removido.');
      aoFechar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Pagamento — ${evento.titulo}`}
      largura="max-w-sm"
      rodape={
        <div className="flex w-full items-center gap-2">
          {evento.valorRecebido !== null && (
            <Botao variante="fantasma" className="text-rose-600 hover:bg-rose-50" onClick={() => salvar(false)} disabled={salvando}>
              Remover
            </Botao>
          )}
          <span className="ml-auto" />
          <Botao variante="fantasma" onClick={aoFechar}>Agora não</Botao>
          <Botao variante="sucesso" onClick={() => salvar(true)} carregando={salvando}>Registrar</Botao>
        </div>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Previsto: <b className="text-slate-900">{moeda(previsto)}</b>
        <span className="text-slate-400"> ({evento.meta} × {moeda(evento.valorUnit)})</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor recebido (R$)">
          <input type="number" inputMode="decimal" step="0.01" min={0} className={estiloInput} value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Data do pagamento">
          <input type="date" className={estiloInput} value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
      </div>
      {valor !== '' && Math.abs(diferenca) >= 0.01 && (
        <p className={`mt-2 text-xs font-medium ${diferenca < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
          {diferenca < 0 ? `${moeda(-diferenca)} a menos que o previsto (descontos, impostos…)` : `${moeda(diferenca)} a mais que o previsto`}
        </p>
      )}
    </Modal>
  );
}
