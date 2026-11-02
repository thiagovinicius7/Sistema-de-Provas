import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Evento, EventoDados } from '../lib/types';
import { salvarEvento, excluirEvento } from '../lib/data';
import { moeda, num } from '../lib/util';
import { Botao, Campo, Modal, Segmentado, TextoAuto, estiloInput, msgErro, useAvisos } from './ui';

const VAZIO: EventoDados = {
  titulo: '', cargo: '', data: '', tipo: 'CE', status: 'Evento não iniciado', meta: 0, valorUnit: 0,
  metaF: 30, metaM: 50, metaD: 20, link: '', conteudo: '', obs: '', planejamento: '',
};

type Form = Omit<EventoDados, 'meta' | 'valorUnit' | 'metaF' | 'metaM' | 'metaD'> & {
  meta: string; valorUnit: string; metaF: string; metaM: string; metaD: string;
};

const paraForm = (e: EventoDados): Form => ({
  ...e,
  meta: e.meta ? String(e.meta) : '',
  valorUnit: e.valorUnit ? String(e.valorUnit) : '',
  metaF: String(e.metaF ?? ''),
  metaM: String(e.metaM ?? ''),
  metaD: String(e.metaD ?? ''),
});

export default function EventoForm({
  aberto,
  evento,
  qtdQuestoes,
  aoFechar,
  aoSalvar,
  aoExcluir,
}: {
  aberto: boolean;
  evento: Evento | null;
  qtdQuestoes: number;
  aoFechar: () => void;
  aoSalvar: (id: string, novo: boolean) => void;
  aoExcluir?: () => void;
}) {
  const { avisar, confirmar } = useAvisos();
  const [f, setF] = useState<Form>(paraForm(VAZIO));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) setF(paraForm(evento ? { ...evento } : VAZIO));
  }, [aberto, evento]);

  const muda = (campo: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const total = num(f.meta) * num(f.valorUnit);
  const somaPct = num(f.metaF) + num(f.metaM) + num(f.metaD);

  async function salvar() {
    if (!f.titulo.trim()) return avisar('Preencha o título.', 'erro');
    if (evento && evento.tipo !== f.tipo && qtdQuestoes > 0) {
      const ok = await confirmar({
        titulo: 'Mudar o tipo da prova?',
        msg: `Este evento já tem ${qtdQuestoes} questão(ões) no formato ${evento.tipo}. Elas continuam salvas, mas podem aparecer incompletas no formato ${f.tipo}.`,
        botao: 'Mudar mesmo assim',
      });
      if (!ok) return;
    }
    setSalvando(true);
    try {
      const dados: EventoDados = {
        ...f,
        meta: num(f.meta), valorUnit: num(f.valorUnit),
        metaF: num(f.metaF), metaM: num(f.metaM), metaD: num(f.metaD),
      };
      const id = await salvarEvento(evento?.id || null, dados);
      avisar(evento ? 'Evento atualizado.' : 'Evento criado.');
      aoSalvar(id, !evento);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!evento) return;
    const ok = await confirmar({
      titulo: 'Excluir evento?',
      msg: (
        <>
          <b>{evento.titulo}</b> e as <b>{qtdQuestoes} questão(ões)</b> dele serão apagados de vez. Se quiser guardar, baixe um backup antes.
        </>
      ),
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    setSalvando(true);
    try {
      await excluirEvento(evento.id);
      avisar('Evento excluído.');
      aoExcluir?.();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={evento ? 'Editar evento' : 'Novo evento'}
      largura="max-w-2xl"
      rodape={
        <div className="flex w-full items-center gap-2">
          {evento && (
            <Botao variante="fantasma" className="text-rose-600 hover:bg-rose-50" onClick={excluir} disabled={salvando}>
              <Trash2 className="size-4" /> Excluir
            </Botao>
          )}
          <span className="ml-auto" />
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} carregando={salvando}>
            {evento ? 'Salvar' : 'Criar evento'}
          </Botao>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Título">
            <input className={estiloInput} value={f.titulo} onChange={muda('titulo')} placeholder="Ex.: SEMA/AM" autoFocus />
          </Campo>
          <Campo rotulo="Cargo">
            <input className={estiloInput} value={f.cargo} onChange={muda('cargo')} placeholder="Ex.: Analista Ambiental" />
          </Campo>
          <Campo rotulo="Data de entrega">
            <input type="date" className={estiloInput} value={f.data} onChange={muda('data')} />
          </Campo>
          <Campo rotulo="Tipo de prova" grupo>
            <div>
              <Segmentado
                opcoes={[{ valor: 'CE', rotulo: 'Certo/Errado' }, { valor: 'ME', rotulo: 'Múltipla escolha' }]}
                valor={f.tipo}
                aoMudar={(v) => v && setF((x) => ({ ...x, tipo: v as 'CE' | 'ME' }))}
              />
            </div>
          </Campo>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo={f.tipo === 'ME' ? 'Meta (questões)' : 'Meta (itens)'}>
              <input type="number" inputMode="numeric" min={0} className={estiloInput} value={f.meta} onChange={muda('meta')} />
            </Campo>
            <Campo rotulo="Valor unitário (R$)">
              <input type="number" inputMode="decimal" min={0} step="0.01" className={estiloInput} value={f.valorUnit} onChange={muda('valorUnit')} />
            </Campo>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <div className="w-full rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Total</div>
                <div className="text-lg font-bold text-emerald-800">{moeda(total)}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Campo rotulo="% Fácil"><input type="number" inputMode="numeric" className={estiloInput} value={f.metaF} onChange={muda('metaF')} /></Campo>
            <Campo rotulo="% Médio"><input type="number" inputMode="numeric" className={estiloInput} value={f.metaM} onChange={muda('metaM')} /></Campo>
            <Campo rotulo="% Difícil"><input type="number" inputMode="numeric" className={estiloInput} value={f.metaD} onChange={muda('metaD')} /></Campo>
          </div>
          {somaPct !== 100 && (
            <p className="mt-2 text-xs font-medium text-amber-700">Os percentuais somam {somaPct}% (o esperado é 100%).</p>
          )}
        </div>

        <Campo rotulo="Link da pasta (Drive, OneDrive…)">
          <input className={estiloInput} value={f.link} onChange={muda('link')} placeholder="https://" />
        </Campo>
        <Campo rotulo="Conteúdo do edital">
          <TextoAuto value={f.conteudo} onChange={muda('conteudo')} minLinhas={3} />
        </Campo>
        <Campo rotulo="Observações gerais">
          <TextoAuto value={f.obs} onChange={muda('obs')} minLinhas={2} />
        </Campo>
      </div>
    </Modal>
  );
}
