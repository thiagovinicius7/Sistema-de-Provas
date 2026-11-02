import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------- Botão ----------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'sucesso';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
  secundario: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 shadow-sm',
  fantasma: 'text-slate-600 hover:bg-slate-100',
  perigo: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  sucesso: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};

export function Botao({
  variante = 'secundario',
  pequeno,
  carregando,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  pequeno?: boolean;
  carregando?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
        pequeno ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-sm',
        VARIANTES[variante],
        className,
      )}
    >
      {carregando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Campos ----------

export function Campo({ rotulo, dica, children, className, grupo }: { rotulo: string; dica?: string; children: ReactNode; className?: string; grupo?: boolean }) {
  const Tag = grupo ? 'div' : 'label';
  return (
    <Tag className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-400">{dica}</span>}
    </Tag>
  );
}

export const estiloInput =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:outline-none';

/** Caixa de texto que cresce com o conteúdo. */
export function TextoAuto({ className, value, minLinhas = 2, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minLinhas?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minLinhas}
      value={value}
      {...props}
      className={cx(estiloInput, 'resize-none overflow-hidden leading-relaxed', className)}
    />
  );
}

/** Botões lado a lado para escolher uma opção. Mostra também um valor antigo que não esteja na lista. */
export function Segmentado({
  opcoes,
  valor,
  aoMudar,
  tamanho = 'md',
}: {
  opcoes: { valor: string; rotulo: string; cor?: string }[];
  valor: string;
  aoMudar: (v: string) => void;
  tamanho?: 'sm' | 'md';
}) {
  const conhecido = opcoes.some((o) => o.valor.toLowerCase() === (valor || '').toLowerCase());
  const lista = !valor || conhecido ? opcoes : [...opcoes, { valor, rotulo: valor }];
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {lista.map((o) => {
        const ativo = o.valor.toLowerCase() === (valor || '').toLowerCase();
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => aoMudar(ativo ? '' : o.valor)}
            className={cx(
              'rounded-md font-semibold transition-all',
              tamanho === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              ativo ? cx('shadow-sm', o.cor || 'bg-white text-slate-900') : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  largura = 'max-w-lg',
  rodape,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  largura?: string;
  rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-[fade_.15s]" onClick={aoFechar} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl animate-[sobe_.2s_ease-out]',
          largura,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button onClick={aoFechar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------- Avisos (toast) e confirmação ----------

type TipoAviso = 'sucesso' | 'erro' | 'info';
interface Aviso { id: number; msg: string; tipo: TipoAviso }
interface Confirmacao { titulo: string; msg: ReactNode; botao: string; perigo?: boolean; resolver: (ok: boolean) => void }

const Ctx = createContext<{
  avisar: (msg: string, tipo?: TipoAviso) => void;
  confirmar: (o: Omit<Confirmacao, 'resolver'>) => Promise<boolean>;
}>({ avisar: () => {}, confirmar: async () => false });

export const useAvisos = () => useContext(Ctx);

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [conf, setConf] = useState<Confirmacao | null>(null);

  const avisar = useCallback((msg: string, tipo: TipoAviso = 'sucesso') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, msg, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);

  const confirmar = useCallback(
    (o: Omit<Confirmacao, 'resolver'>) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })),
    [],
  );

  const fechar = (ok: boolean) => {
    conf?.resolver(ok);
    setConf(null);
  };

  return (
    <Ctx.Provider value={{ avisar, confirmar }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-[sobe_.2s_ease-out]',
              a.tipo === 'sucesso' && 'bg-slate-900 text-white',
              a.tipo === 'erro' && 'bg-rose-600 text-white',
              a.tipo === 'info' && 'bg-white text-slate-800 ring-1 ring-slate-200',
            )}
          >
            {a.tipo === 'sucesso' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />}
            {a.tipo === 'erro' && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {a.tipo === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-sky-500" />}
            <span>{a.msg}</span>
          </div>
        ))}
      </div>
      <Modal
        aberto={!!conf}
        aoFechar={() => fechar(false)}
        titulo={conf?.titulo}
        largura="max-w-sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => fechar(false)}>Cancelar</Botao>
            <Botao variante={conf?.perigo ? 'perigo' : 'primario'} onClick={() => fechar(true)} autoFocus>
              {conf?.botao}
            </Botao>
          </>
        }
      >
        <div className="text-sm text-slate-600">{conf?.msg}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export function msgErro(e: unknown): string {
  const m = (e as any)?.message || String(e);
  const code = (e as any)?.code || '';
  if (code.includes('permission-denied')) return 'Sem permissão para essa operação.';
  if (code.includes('unavailable')) return 'Sem conexão com o banco. Verifique a internet.';
  if (code.includes('popup-blocked')) return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'A janela do Google foi fechada antes de concluir.';
  return m;
}

// ---------- Valores em R$ escondidos ----------

const CtxValores = createContext<{ visivel: boolean; mostrar: () => void; esconder: () => void }>({
  visivel: false,
  mostrar: () => {},
  esconder: () => {},
});

export const useValores = () => useContext(CtxValores);

/** Os valores começam embaçados; um toque em qualquer um mostra todos. */
export function ProvedorValores({ children }: { children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <CtxValores.Provider value={{ visivel, mostrar: () => setVisivel(true), esconder: () => setVisivel(false) }}>
      {children}
    </CtxValores.Provider>
  );
}

export function Valor({ children, className }: { children: ReactNode; className?: string }) {
  const { visivel, mostrar } = useValores();
  if (visivel) return <span className={className}>{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Toque para mostrar os valores"
      aria-label="Valor escondido. Toque para mostrar."
      onClick={(e) => { e.stopPropagation(); mostrar(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); mostrar(); } }}
      className={cx(className, 'cursor-pointer select-none blur-[6px] transition-[filter]')}
    >
      {children}
    </span>
  );
}
