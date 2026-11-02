import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CalendarDays, ChevronRight, ClipboardList, FileDown, FileText, ListChecks, Loader2, NotebookPen, Pencil, Plus, ScrollText, StickyNote,
} from 'lucide-react';
import type { Evento, Questao } from '../lib/types';
import { salvarPlanejamento } from '../lib/data';
import { ESCOPO_DRIVE, auth, obterTokenGoogle } from '../lib/firebase';
import { criarNoGoogleDocs, criarWord, nomeDaProva } from '../lib/prova';
import { baixarArquivo } from '../lib/importar';
import { calcularProgresso, dataBR, moeda, ordenarQuestoes, totalEvento } from '../lib/util';
import { BotaoLink, SeletorStatus, SeloPagamento, SeloPrazo } from './Dashboard';
import Cobertura from './Cobertura';
import Pagamento from './Pagamento';
import { topicosDoEvento } from '../lib/edital';
import QuestaoForm from './QuestaoForm';
import { Botao, Modal, TextoAuto, cx, msgErro, useAvisos } from './ui';

type Painel = 'plan' | 'cobertura' | 'edital' | 'obs' | null;

function Meta({ rotulo, feito, alvo, cor }: { rotulo: string; feito: number; alvo: number; cor: string }) {
  const ok = alvo > 0 && feito >= alvo;
  const passou = alvo >= 0 && feito > alvo;
  return (
    <div className={cx('flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1', ok ? 'ring-emerald-300' : 'ring-slate-200')}>
      <span className={cx('size-2.5 rounded-full', cor)} />
      <span className="text-xs font-semibold text-slate-600">{rotulo}</span>
      <span className={cx('text-sm font-bold tabular-nums', passou ? 'text-amber-600' : ok ? 'text-emerald-700' : 'text-slate-900')}>
        {feito}<span className="font-medium text-slate-400">/{alvo}</span>
      </span>
    </div>
  );
}

function Planejamento({ evento }: { evento: Evento }) {
  const [texto, setTexto] = useState(evento.planejamento);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const pendente = useRef<string | null>(null);
  const timer = useRef<number>(0);

  // Atualização vinda de outro aparelho, quando não há nada pendente aqui.
  useEffect(() => {
    if (pendente.current === null) setTexto(evento.planejamento);
  }, [evento.planejamento]);

  const gravar = () => {
    const t = pendente.current;
    if (t === null) return;
    setEstado('salvando');
    salvarPlanejamento(evento.id, t)
      .then(() => { if (pendente.current === t) pendente.current = null; setEstado('salvo'); })
      .catch(() => setEstado('erro'));
  };

  // Grava o que faltar ao sair da tela.
  useEffect(() => () => { window.clearTimeout(timer.current); gravar(); }, []); // eslint-disable-line

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-800">Planejamento</span>
        <span className="text-xs text-slate-500">
          {estado === 'salvando' && 'Salvando…'}
          {estado === 'salvo' && 'Salvo na nuvem'}
          {estado === 'erro' && <span className="text-rose-600">Erro ao salvar — continue digitando para tentar de novo</span>}
        </span>
      </div>
      <TextoAuto
        value={texto}
        minLinhas={5}
        className="bg-white"
        placeholder="Anote aqui a divisão dos itens, prazos, ideias…"
        onChange={(e) => {
          setTexto(e.target.value);
          pendente.current = e.target.value;
          setEstado('');
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(gravar, 1200);
        }}
        onBlur={() => { window.clearTimeout(timer.current); gravar(); }}
      />
    </div>
  );
}

export default function EventoTela({
  evento,
  questoes,
  todasQuestoes,
  selecionada,
  irPara,
  voltar,
  editarEvento,
  aoMudarSujo,
  pedirConfirmacaoSeSujo,
}: {
  evento: Evento;
  questoes: Questao[];
  /** Todas as questões do banco, para a lista de fontes já usadas. */
  todasQuestoes: Questao[];
  selecionada: string | null;
  irPara: (qid: string | null, substituir?: boolean) => void;
  voltar: () => void;
  editarEvento: () => void;
  aoMudarSujo: (s: boolean) => void;
  pedirConfirmacaoSeSujo: () => Promise<boolean>;
}) {
  const { avisar } = useAvisos();
  const [painel, setPainel] = useState<Painel>(null);
  const [gerando, setGerando] = useState<'' | 'docs' | 'word'>('');
  const [menuProva, setMenuProva] = useState(false);
  const [linkDoc, setLinkDoc] = useState('');
  const [pagamento, setPagamento] = useState(false);
  const topicos = useMemo(() => topicosDoEvento(evento), [evento.topicos, evento.conteudo]); // eslint-disable-line

  const lista = useMemo(() => ordenarQuestoes(questoes), [questoes]);
  const p = calcularProgresso(evento, questoes);
  const proximo = lista.length ? Math.max(...lista.map((q) => q.numero)) + 1 : 1;
  const numeros = useMemo(() => new Map(lista.map((q) => [q.numero, q.id])), [lista]);
  const atual = selecionada && selecionada !== 'nova' ? lista.find((q) => q.id === selecionada) || null : null;
  const mostrandoForm = selecionada === 'nova' || !!atual;

  // Desktop abre direto numa questão nova (como no sistema antigo).
  useEffect(() => {
    if (!selecionada && window.matchMedia('(min-width: 1024px)').matches) irPara('nova', true);
  }, [selecionada]); // eslint-disable-line

  // Questão apagada em outro aparelho: volta para a lista.
  useEffect(() => {
    if (selecionada && selecionada !== 'nova' && !atual) {
      const t = setTimeout(() => irPara(null, true), 400);
      return () => clearTimeout(t);
    }
  }, [selecionada, atual]); // eslint-disable-line

  const ehGoogle = !!auth.currentUser?.providerData.some((x) => x.providerId === 'google.com');

  async function gerarDocs() {
    setMenuProva(false);
    if (!lista.length) return avisar('Não há questões para gerar a prova.', 'erro');
    setGerando('docs');
    try {
      const token = await obterTokenGoogle([ESCOPO_DRIVE]);
      const link = await criarNoGoogleDocs(evento, lista, token);
      setLinkDoc(link);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setGerando('');
    }
  }

  async function gerarWord() {
    setMenuProva(false);
    if (!lista.length) return avisar('Não há questões para gerar a prova.', 'erro');
    setGerando('word');
    try {
      const blob = await criarWord(evento, lista);
      baixarArquivo(nomeDaProva(evento).replace(/[\\/:*?"<>|]/g, '-') + '.docx', blob);
      avisar('Arquivo Word baixado.');
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setGerando('');
    }
  }

  const abrirQuestao = async (id: string) => {
    if (id === selecionada) return;
    if (await pedirConfirmacaoSeSujo()) irPara(id);
  };

  const listaQuestoes = (
    <div className="flex flex-col">
      <button
        onClick={() => abrirQuestao('nova')}
        className={cx(
          'mb-2 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
          selecionada === 'nova' ? 'bg-slate-900 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50',
        )}
      >
        <Plus className="size-4" /> Nova questão
      </button>
      {lista.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">Nenhuma questão ainda.</p>}
      <div className="grid gap-1">
        {lista.map((q) => {
          const ativa = q.id === selecionada;
          const difs = evento.tipo === 'ME' ? [q.dif] : q.itens.map((i) => i.dif);
          return (
            <button
              key={q.id}
              onClick={() => abrirQuestao(q.id)}
              className={cx(
                'flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition',
                ativa ? 'bg-white shadow-sm ring-1 ring-slate-300' : 'hover:bg-white/70',
              )}
            >
              <span className={cx('mt-0.5 text-sm font-bold tabular-nums', ativa ? 'text-slate-900' : 'text-slate-500')}>{q.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm text-slate-700">{q.enunciado || <i className="text-slate-400">Sem enunciado</i>}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {difs.map((d, k) => (
                    <span
                      key={k}
                      className={cx(
                        'rounded px-1 text-[10px] font-bold leading-4',
                        d === 'F' && 'bg-emerald-100 text-emerald-700',
                        d === 'M' && 'bg-amber-100 text-amber-700',
                        d === 'D' && 'bg-rose-100 text-rose-700',
                        !d && 'bg-slate-100 text-slate-400',
                      )}
                    >
                      {d || '–'}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-300 lg:hidden" />
            </button>
          );
        })}
      </div>
    </div>
  );

  const botaoPainel = (id: Exclude<Painel, null>, rotulo: string, Icone: typeof StickyNote) => (
    <button
      onClick={() => setPainel((x) => (x === id ? null : id))}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
        painel === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
      )}
    >
      <Icone className="size-3.5" /> {rotulo}
    </button>
  );

  return (
    <div className="min-h-dvh">
      {/* Cabeçalho do evento */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-start gap-2">
            <button
              onClick={async () => (await pedirConfirmacaoSeSujo()) && voltar()}
              className="-ml-1.5 mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Voltar"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight text-slate-900">{evento.titulo}</h1>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">{evento.tipo}</span>
              </div>
              {evento.cargo && <p className="line-clamp-2 text-xs text-slate-500">{evento.cargo}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{dataBR(evento.data)}</span>
                <span className="font-semibold text-emerald-700">{moeda(totalEvento(evento))}</span>
                <SeletorStatus evento={evento} />
                <SeloPrazo evento={evento} />
                <SeloPagamento evento={evento} aoClicar={() => setPagamento(true)} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <BotaoLink link={evento.link} />
              <button onClick={editarEvento} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Editar evento">
                <Pencil className="size-4" />
              </button>
              <div className="relative">
                <Botao variante="sucesso" pequeno onClick={() => setMenuProva((v) => !v)} carregando={!!gerando} className="ml-1">
                  {!gerando && <FileText className="size-4" />} <span className="hidden sm:inline">Gerar</span> prova
                </Botao>
                {menuProva && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuProva(false)} />
                    <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
                      <button
                        disabled={!ehGoogle}
                        onClick={gerarDocs}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-40"
                      >
                        <FileText className="mt-0.5 size-4 text-sky-600" />
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">Google Docs</span>
                          <span className="block text-xs text-slate-500">{ehGoogle ? 'Cria no seu Google Drive' : 'Só com login Google'}</span>
                        </span>
                      </button>
                      <button onClick={gerarWord} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50">
                        <FileDown className="mt-0.5 size-4 text-indigo-600" />
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">Word (.docx)</span>
                          <span className="block text-xs text-slate-500">Baixa o arquivo no aparelho</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progresso */}
          <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">
                {evento.tipo === 'ME' ? 'Questões' : 'Itens'}: <span className="text-slate-900">{p.total}</span> de {p.meta}
              </span>
              <span className="font-bold tabular-nums text-slate-700">{p.pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className={cx('h-full rounded-full transition-all', p.pct >= 100 ? 'bg-emerald-500' : 'bg-slate-800')} style={{ width: `${p.pct}%` }} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Meta rotulo="Fácil" feito={p.f} alvo={p.alvoF} cor="bg-emerald-500" />
              <Meta rotulo="Médio" feito={p.m} alvo={p.alvoM} cor="bg-amber-500" />
              <Meta rotulo="Difícil" feito={p.d} alvo={p.alvoD} cor="bg-rose-500" />
              {p.semDif > 0 && <span className="text-xs text-slate-500">{p.semDif} sem dificuldade</span>}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {botaoPainel('plan', 'Planejamento', NotebookPen)}
            {botaoPainel('cobertura', 'Cobertura do edital', ListChecks)}
            {botaoPainel('edital', 'Edital', ScrollText)}
            {botaoPainel('obs', 'Observações', StickyNote)}
          </div>
          {painel && (
            <div
              className={cx(
                'mt-3 rounded-xl p-3 ring-1',
                painel === 'plan' && 'bg-violet-50 ring-violet-200',
                painel === 'cobertura' && 'bg-emerald-50/60 ring-emerald-200',
                painel === 'edital' && 'bg-sky-50 ring-sky-200',
                painel === 'obs' && 'bg-amber-50 ring-amber-200',
              )}
            >
              {painel === 'plan' && <Planejamento key={evento.id} evento={evento} />}
              {painel === 'cobertura' && (
                <Cobertura
                  evento={evento}
                  questoes={questoes}
                  abrirQuestao={(n) => {
                    const q = lista.find((x) => x.numero === n);
                    if (q) abrirQuestao(q.id);
                  }}
                />
              )}
              {(painel === 'edital' || painel === 'obs') && (
                <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700 barra-fina">
                  {(painel === 'edital' ? evento.conteudo : evento.obs) || (
                    <span className="text-slate-400">Vazio. Use o lápis no topo para editar o evento.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Questões */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 lg:grid-cols-[300px_1fr]">
        <aside className={cx('lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto barra-fina', mostrandoForm && 'hidden')}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <ClipboardList className="size-3.5" /> Questões ({lista.length})
          </div>
          {listaQuestoes}
        </aside>
        <main className={cx('min-w-0', !mostrandoForm && 'hidden lg:block')}>
          {mostrandoForm ? (
            <>
              <button
                onClick={async () => (await pedirConfirmacaoSeSujo()) && irPara(null)}
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 lg:hidden"
              >
                <ArrowLeft className="size-4" /> Questões
              </button>
              <QuestaoForm
                key={evento.tipo}
                evento={evento}
                questao={atual}
                proximoNumero={proximo}
                numerosUsados={numeros}
                topicos={topicos}
                todasQuestoes={todasQuestoes}
                aoMudarSujo={aoMudarSujo}
                aoSalvar={(id, nova) => nova && irPara(id, true)}
                aoExcluir={() => irPara(window.matchMedia('(min-width: 1024px)').matches ? 'nova' : null, true)}
              />
            </>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-slate-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </main>
      </div>

      {pagamento && <Pagamento evento={evento} aoFechar={() => setPagamento(false)} />}
      <Modal aberto={!!linkDoc} aoFechar={() => setLinkDoc('')} titulo="Prova gerada" largura="max-w-sm">
        <div className="text-center">
          <p className="mb-4 text-sm text-slate-600">O documento foi criado no seu Google Drive.</p>
          <a
            href={linkDoc}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setLinkDoc('')}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <FileText className="size-4" /> Abrir documento
          </a>
        </div>
      </Modal>
    </div>
  );
}
