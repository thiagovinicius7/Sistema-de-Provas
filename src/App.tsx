import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Loader2, LockKeyhole, Settings2, ShieldAlert } from 'lucide-react';
import { auth, entrarComGoogle, firebaseConfigurado, sair } from './lib/firebase';
import { emailAutorizado } from './lib/acesso';
import { ouvirEventos, ouvirQuestoes } from './lib/data';
import type { Evento, Questao } from './lib/types';
import Dashboard from './components/Dashboard';
import EventoForm from './components/EventoForm';
import EventoTela from './components/EventoTela';
import Ferramentas from './components/Ferramentas';
import { Botao, ProvedorAvisos, msgErro, useAvisos } from './components/ui';

const INATIVIDADE_MIN = 60;

// ---------- Rotas (#/e/<evento>/<questão>) ----------

interface Rota { evento: string | null; questao: string | null }

function lerRota(): Rota {
  const partes = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (partes[0] === 'e' && partes[1]) return { evento: partes[1], questao: partes[2] || null };
  return { evento: null, questao: null };
}

function hashDe(r: Rota) {
  if (!r.evento) return '#/';
  return `#/e/${r.evento}` + (r.questao ? `/${r.questao}` : '');
}

// ---------- Telas fora do sistema ----------

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">{children}</div>
    </div>
  );
}

function Logo() {
  return <img src="favicon.svg" alt="" className="mx-auto mb-4 size-14" />;
}

function TelaLogin() {
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);
  return (
    <Centro>
      <Logo />
      <h1 className="text-xl font-bold text-slate-900">BancoP</h1>
      <p className="mt-1 text-sm text-slate-500">Acesso restrito.</p>
      <button
        onClick={async () => {
          setErro('');
          setEntrando(true);
          try { await entrarComGoogle(); } catch (e) { setErro(msgErro(e)); } finally { setEntrando(false); }
        }}
        disabled={entrando}
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        {entrando ? <Loader2 className="size-4 animate-spin" /> : (
          <svg className="size-4" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        )}
        Entrar com Google
      </button>
      {erro && <p className="mt-3 text-xs text-rose-600">{erro}</p>}
    </Centro>
  );
}

function TelaNegado({ email }: { email: string | null }) {
  return (
    <Centro>
      <ShieldAlert className="mx-auto mb-3 size-12 text-rose-500" />
      <h1 className="text-lg font-bold text-slate-900">Acesso não autorizado</h1>
      <p className="mt-2 text-sm text-slate-500">
        A conta <b className="text-slate-700">{email}</b> não tem permissão para usar este sistema.
      </p>
      <Botao className="mt-5 w-full" onClick={() => sair()}>Entrar com outra conta</Botao>
    </Centro>
  );
}

function TelaSemConfig() {
  return (
    <Centro>
      <LockKeyhole className="mx-auto mb-3 size-12 text-slate-400" />
      <h1 className="text-lg font-bold text-slate-900">Falta configurar o Firebase</h1>
      <p className="mt-2 text-sm text-slate-500">Cole os dados do projeto no arquivo <code>firebase-config.json</code>.</p>
    </Centro>
  );
}

function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Loader2 className="size-7 animate-spin text-slate-400" />
      {texto}
    </div>
  );
}

// ---------- Sistema ----------

function Sistema({ usuario }: { usuario: User }) {
  const { avisar, confirmar } = useAvisos();
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [questoes, setQuestoes] = useState<Questao[] | null>(null);
  const [negado, setNegado] = useState(false);
  const [rota, setRota] = useState<Rota>(lerRota);
  const [form, setForm] = useState<{ aberto: boolean; evento: Evento | null }>({ aberto: false, evento: null });
  const [ferramentas, setFerramentas] = useState(false);
  const sujo = useRef(false);
  const ignorarHash = useRef(false);

  // Dados em tempo real.
  useEffect(() => {
    const falha = (e: Error) => {
      if ((e as any).code === 'permission-denied') setNegado(true);
      else avisar(msgErro(e), 'erro');
    };
    const a = ouvirEventos(setEventos, falha);
    const b = ouvirQuestoes(setQuestoes, falha);
    return () => { a(); b(); };
  }, [avisar]);

  // Sai sozinho depois de um tempo sem uso.
  useEffect(() => {
    let t = 0;
    const reinicia = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (!sujo.current) sair();
      }, INATIVIDADE_MIN * 60 * 1000);
    };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, reinicia, { passive: true }));
    reinicia();
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reinicia)); };
  }, []);

  // Aviso do navegador ao fechar a aba com questão não salva.
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (sujo.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  const pedirConfirmacaoSeSujo = useCallback(async () => {
    if (!sujo.current) return true;
    const ok = await confirmar({
      titulo: 'Descartar alterações?',
      msg: 'A questão aberta tem alterações que ainda não foram salvas.',
      botao: 'Descartar',
      perigo: true,
    });
    if (ok) sujo.current = false;
    return ok;
  }, [confirmar]);

  // Botão voltar do celular/navegador.
  useEffect(() => {
    const f = async () => {
      if (ignorarHash.current) { ignorarHash.current = false; return; }
      const nova = lerRota();
      if (sujo.current) {
        ignorarHash.current = true;
        window.location.hash = hashDe(rota);
        if (await pedirConfirmacaoSeSujo()) {
          ignorarHash.current = true;
          window.location.hash = hashDe(nova);
          setRota(nova);
        }
        return;
      }
      setRota(nova);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, [rota, pedirConfirmacaoSeSujo]);

  const navegar = useCallback((r: Rota, substituir = false) => {
    const h = hashDe(r);
    if (substituir) window.history.replaceState(null, '', h);
    else window.history.pushState(null, '', h);
    sujo.current = false;
    setRota(r);
    window.scrollTo({ top: 0 });
  }, []);

  const aoMudarSujo = useCallback((s: boolean) => { sujo.current = s; }, []);

  const evento = useMemo(() => (rota.evento && eventos ? eventos.find((e) => e.id === rota.evento) || null : null), [rota.evento, eventos]);
  const questoesEvento = useMemo(() => (evento && questoes ? questoes.filter((q) => q.eventoId === evento.id) : []), [evento, questoes]);

  if (negado) return <TelaNegado email={usuario.email} />;
  if (!eventos || !questoes) return <Carregando texto="Carregando eventos…" />;

  const formulario = (
    <EventoForm
      aberto={form.aberto}
      evento={form.evento}
      qtdQuestoes={form.evento ? questoes.filter((q) => q.eventoId === form.evento!.id).length : 0}
      aoFechar={() => setForm({ aberto: false, evento: null })}
      aoSalvar={(id, novo) => {
        setForm({ aberto: false, evento: null });
        if (novo) navegar({ evento: id, questao: null });
      }}
      aoExcluir={() => {
        setForm({ aberto: false, evento: null });
        navegar({ evento: null, questao: null }, true);
      }}
    />
  );

  if (rota.evento) {
    if (!evento) {
      return (
        <Centro>
          <p className="text-sm text-slate-600">Evento não encontrado.</p>
          <Botao className="mt-4 w-full" onClick={() => navegar({ evento: null, questao: null }, true)}>Ir para os eventos</Botao>
        </Centro>
      );
    }
    return (
      <>
        <EventoTela
          key={evento.id}
          evento={evento}
          questoes={questoesEvento}
          selecionada={rota.questao}
          irPara={(q, subst) => navegar({ evento: evento.id, questao: q }, subst)}
          voltar={() => navegar({ evento: null, questao: null })}
          editarEvento={() => setForm({ aberto: true, evento })}
          aoMudarSujo={aoMudarSujo}
          pedirConfirmacaoSeSujo={pedirConfirmacaoSeSujo}
        />
        {formulario}
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <img src="favicon.svg" alt="" className="size-8" />
          <div className="flex-1 leading-tight">
            <div className="text-sm font-bold text-slate-900">BancoP</div>
            <div className="text-[11px] text-slate-500">Banco de questões e provas</div>
          </div>
          <button
            onClick={() => setFerramentas(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Ferramentas"
            title="Importar, backup e sair"
          >
            <Settings2 className="size-5" />
          </button>
        </div>
      </header>
      <Dashboard
        eventos={eventos}
        questoes={questoes}
        abrirEvento={(id) => navegar({ evento: id, questao: null })}
        editarEvento={(e) => setForm({ aberto: true, evento: e })}
        novoEvento={() => setForm({ aberto: true, evento: null })}
      />
      {formulario}
      <Ferramentas aberto={ferramentas} aoFechar={() => setFerramentas(false)} eventos={eventos} questoes={questoes} />
    </>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!firebaseConfigurado) return;
    return onAuthStateChanged(auth, setUsuario);
  }, []);

  let tela;
  if (!firebaseConfigurado) tela = <TelaSemConfig />;
  else if (usuario === undefined) tela = <Carregando />;
  else if (!usuario) tela = <TelaLogin />;
  else if (!emailAutorizado(usuario.email)) tela = <TelaNegado email={usuario.email} />;
  else tela = <Sistema key={usuario.uid} usuario={usuario} />;

  return <ProvedorAvisos>{tela}</ProvedorAvisos>;
}
