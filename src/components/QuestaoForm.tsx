import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopyPlus, Plus, Save, Trash2, X } from 'lucide-react';
import type { Dificuldade, Evento, Item, Questao } from '../lib/types';
import { salvarQuestao, excluirQuestao } from '../lib/data';
import { Botao, Campo, Segmentado, TextoAuto, cx, estiloInput, msgErro, useAvisos } from './ui';

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

export const OPC_DIF = [
  { valor: 'F', rotulo: 'F', cor: 'bg-emerald-600 text-white' },
  { valor: 'M', rotulo: 'M', cor: 'bg-amber-500 text-white' },
  { valor: 'D', rotulo: 'D', cor: 'bg-rose-600 text-white' },
];
const OPC_GAB_ME = [
  { valor: 'certa', rotulo: 'Certa', cor: 'bg-emerald-600 text-white' },
  { valor: 'errada', rotulo: 'Errada', cor: 'bg-slate-700 text-white' },
];
const OPC_GAB_CE = [
  { valor: 'C', rotulo: 'C', cor: 'bg-emerald-600 text-white' },
  { valor: 'E', rotulo: 'E', cor: 'bg-slate-700 text-white' },
];

interface Estado {
  numero: string;
  enunciado: string;
  dif: Dificuldade;
  gab: string;
  itens: Item[];
}

function itemVazio(tipo: 'CE' | 'ME', letra?: string): Item {
  return tipo === 'ME'
    ? { letra, texto: '', gab: '', edital: '', justificativa: '' }
    : { dif: '', texto: '', gab: '', edital: '', justificativa: '' };
}

function estadoInicial(evento: Evento, q: Questao | null, proximo: number): Estado {
  if (q) {
    return {
      numero: String(q.numero),
      enunciado: q.enunciado,
      dif: q.dif,
      gab: q.gab,
      itens: q.itens.length
        ? q.itens.map((i) => ({ ...i }))
        : evento.tipo === 'ME' ? LETRAS.map((l) => itemVazio('ME', l)) : [itemVazio('CE')],
    };
  }
  return {
    numero: String(proximo),
    enunciado: '',
    dif: '',
    gab: '',
    itens: evento.tipo === 'ME' ? LETRAS.map((l) => itemVazio('ME', l)) : [itemVazio('CE')],
  };
}

export default function QuestaoForm({
  evento,
  questao,
  proximoNumero,
  numerosUsados,
  aoSalvar,
  aoExcluir,
  aoMudarSujo,
}: {
  evento: Evento;
  questao: Questao | null;
  proximoNumero: number;
  numerosUsados: Map<number, string>;
  aoSalvar: (id: string, nova: boolean) => void;
  aoExcluir: () => void;
  aoMudarSujo: (sujo: boolean) => void;
}) {
  const { avisar, confirmar } = useAvisos();
  const ME = evento.tipo === 'ME';
  // Assinatura do conteúdo salvo: o formulário só recarrega quando o conteúdo muda de verdade.
  const assinatura = questao
    ? JSON.stringify([questao.id, questao.numero, questao.enunciado, questao.dif, questao.gab, questao.itens])
    : 'nova:' + evento.tipo;
  const inicial = useMemo(() => estadoInicial(evento, questao, proximoNumero), [assinatura]); // eslint-disable-line
  const [s, setS] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const base = useRef(JSON.stringify(inicial));
  const idAtual = useRef(questao?.id);

  // Troca de questão: recarrega. Mesma questão alterada em outro aparelho: só recarrega
  // se não houver edição em andamento aqui, para nunca jogar fora o que está sendo digitado.
  useEffect(() => {
    const trocou = idAtual.current !== questao?.id;
    idAtual.current = questao?.id;
    if (trocou || JSON.stringify(s) === base.current) {
      setS(inicial);
      base.current = JSON.stringify(inicial);
    }
  }, [inicial]); // eslint-disable-line

  // Questão nova: acompanha o próximo número enquanto nada foi digitado.
  useEffect(() => {
    if (!questao && JSON.stringify(s) === base.current && s.numero !== String(proximoNumero)) {
      const novo = { ...s, numero: String(proximoNumero) };
      base.current = JSON.stringify(novo);
      setS(novo);
    }
  }, [proximoNumero]); // eslint-disable-line

  const sujo = JSON.stringify(s) !== base.current;
  useEffect(() => aoMudarSujo(sujo), [sujo, aoMudarSujo]);

  const mudaItem = (i: number, campo: keyof Item, valor: string) =>
    setS((x) => {
      const itens = x.itens.map((it, k) => (k === i ? { ...it, [campo]: valor } : it));
      let gab = x.gab;
      // ME: ao marcar a única alternativa certa, preenche o gabarito se estiver vazio.
      if (ME && campo === 'gab' && valor === 'certa' && !gab) gab = itens[i].letra || '';
      return { ...x, itens, gab };
    });

  const copiarEdital = (i: number) =>
    setS((x) => ({ ...x, itens: x.itens.map((it) => ({ ...it, edital: x.itens[i].edital })) }));

  const salvar = useCallback(async () => {
    const numero = parseInt(s.numero, 10);
    if (!numero || numero < 1) return avisar('Informe o número da questão.', 'erro');
    if (!s.enunciado.trim() && !(await confirmar({ titulo: 'Enunciado vazio', msg: 'Salvar a questão sem enunciado?', botao: 'Salvar' }))) return;
    const dono = numerosUsados.get(numero);
    if (dono && dono !== questao?.id) {
      const ok = await confirmar({
        titulo: `Já existe a questão ${numero}`,
        msg: 'Salvar com o número repetido? Você pode corrigir depois.',
        botao: 'Salvar mesmo assim',
      });
      if (!ok) return;
    }
    setSalvando(true);
    try {
      const id = await salvarQuestao(questao?.id || null, {
        eventoId: evento.id,
        numero,
        enunciado: s.enunciado,
        tipo: evento.tipo,
        dif: s.dif,
        gab: s.gab,
        itens: s.itens,
      });
      base.current = JSON.stringify(s);
      aoMudarSujo(false);
      avisar(questao ? `Questão ${numero} salva.` : `Questão ${numero} criada.`);
      aoSalvar(id, !questao);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }, [s, questao, evento, numerosUsados, avisar, confirmar, aoSalvar, aoMudarSujo]);

  // Ctrl+S / Cmd+S salva.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!salvando) salvar();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [salvar, salvando]);

  async function excluir() {
    if (!questao) return;
    const ok = await confirmar({ titulo: `Excluir a questão ${questao.numero}?`, msg: 'Ela será apagada de vez.', botao: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await excluirQuestao(questao.id);
      avisar('Questão excluída.');
      aoExcluir();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    }
  }

  return (
    <div className="pb-28">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">
          {questao ? `Questão ${questao.numero}` : 'Nova questão'}
          {sujo && <span className="ml-2 align-middle text-xs font-medium text-amber-600">• não salva</span>}
        </h2>
        {questao && (
          <Botao pequeno variante="fantasma" className="text-rose-600 hover:bg-rose-50" onClick={excluir}>
            <Trash2 className="size-4" /> Excluir
          </Botao>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
        <Campo rotulo="Número">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className={cx(estiloInput, 'text-base font-bold')}
            value={s.numero}
            onChange={(e) => setS((x) => ({ ...x, numero: e.target.value }))}
          />
        </Campo>
        <Campo rotulo="Enunciado">
          <TextoAuto value={s.enunciado} minLinhas={3} onChange={(e) => setS((x) => ({ ...x, enunciado: e.target.value }))} />
        </Campo>
      </div>

      {ME && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Dificuldade</span>
            <Segmentado opcoes={OPC_DIF} valor={s.dif} aoMudar={(v) => setS((x) => ({ ...x, dif: v as Dificuldade }))} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Gabarito</span>
            <Segmentado
              opcoes={LETRAS.map((l) => ({ valor: l, rotulo: l, cor: 'bg-slate-900 text-white' }))}
              valor={s.gab}
              aoMudar={(v) => setS((x) => ({ ...x, gab: v }))}
            />
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {s.itens.map((it, i) => (
          <div
            key={i}
            className={cx(
              'rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 border-l-4',
              it.gab.toLowerCase().startsWith('c') ? 'border-l-emerald-500' : it.gab ? 'border-l-slate-500' : 'border-l-slate-200',
            )}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-900 px-2 text-xs font-bold text-white">
                {ME ? it.letra || LETRAS[i] : `Item ${i + 1}`}
              </span>
              {!ME && <Segmentado tamanho="sm" opcoes={OPC_DIF} valor={it.dif || ''} aoMudar={(v) => mudaItem(i, 'dif', v)} />}
              <Segmentado tamanho="sm" opcoes={ME ? OPC_GAB_ME : OPC_GAB_CE} valor={it.gab} aoMudar={(v) => mudaItem(i, 'gab', v)} />
              {!ME && s.itens.length > 1 && (
                <button
                  className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Remover item"
                  onClick={async () => {
                    const vazio = !it.texto && !it.justificativa && !it.edital;
                    if (vazio || (await confirmar({ titulo: `Remover o item ${i + 1}?`, msg: 'O texto dele será descartado ao salvar.', botao: 'Remover', perigo: true })))
                      setS((x) => ({ ...x, itens: x.itens.filter((_, k) => k !== i) }));
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <TextoAuto
              value={it.texto}
              minLinhas={2}
              placeholder={ME ? 'Texto da alternativa' : 'Texto do item'}
              onChange={(e) => mudaItem(i, 'texto', e.target.value)}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="relative">
                <TextoAuto
                  value={it.edital}
                  minLinhas={1}
                  placeholder="Conteúdo do edital"
                  className="pr-9 text-xs"
                  onChange={(e) => mudaItem(i, 'edital', e.target.value)}
                />
                {it.edital && s.itens.length > 1 && (
                  <button
                    title="Usar este conteúdo do edital em todos os itens"
                    className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => copiarEdital(i)}
                  >
                    <CopyPlus className="size-4" />
                  </button>
                )}
              </div>
              <TextoAuto
                value={it.justificativa}
                minLinhas={1}
                placeholder="Justificativa"
                className="text-xs"
                onChange={(e) => mudaItem(i, 'justificativa', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      {!ME && (
        <Botao className="mt-3 w-full border-dashed" onClick={() => setS((x) => ({ ...x, itens: [...x.itens, itemVazio('CE')] }))}>
          <Plus className="size-4" /> Adicionar item
        </Botao>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:mt-6 lg:rounded-xl lg:border lg:shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">Ctrl+S salva</span>
          <Botao variante={sujo ? 'primario' : 'secundario'} className="ml-auto w-full sm:w-auto sm:min-w-44" onClick={salvar} carregando={salvando}>
            <Save className="size-4" /> {sujo ? 'Salvar alterações' : 'Salvo'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
