import { useRef, useState } from 'react';
import { DatabaseBackup, Download, FileUp, LogOut, Sheet } from 'lucide-react';
import type { Evento, Questao } from '../lib/types';
import { ESCOPO_PLANILHAS, auth, obterTokenGoogle, sair } from '../lib/firebase';
import { baixarArquivo, gerarBackup, importarDaPlanilha, restaurarBackup, type ResultadoImportacao } from '../lib/importar';
import { Botao, Modal, msgErro, useAvisos } from './ui';

export default function Ferramentas({
  aberto,
  aoFechar,
  eventos,
  questoes,
}: {
  aberto: boolean;
  aoFechar: () => void;
  eventos: Evento[];
  questoes: Questao[];
}) {
  const { avisar, confirmar } = useAvisos();
  const [ocupado, setOcupado] = useState('');
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const usuario = auth.currentUser;
  const ehGoogle = !!usuario?.providerData.some((p) => p.providerId === 'google.com');

  async function importar() {
    setResultado(null);
    setOcupado('Pedindo acesso à planilha…');
    try {
      const token = await obterTokenGoogle([ESCOPO_PLANILHAS]);
      const r = await importarDaPlanilha(
        token,
        { eventos: new Set(eventos.map((e) => e.id)), questoes: new Set(questoes.map((q) => q.id)) },
        setOcupado,
      );
      setResultado(r);
      avisar(r.eventosNovos + r.questoesNovas ? 'Importação concluída.' : 'Nada novo para importar.');
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setOcupado('');
    }
  }

  function backup() {
    const dados = gerarBackup(eventos, questoes);
    const dia = new Date().toISOString().slice(0, 10);
    baixarArquivo(`backup-bancop-${dia}.json`, new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    avisar('Backup baixado.');
  }

  async function restaurar(f: File) {
    const ok = await confirmar({
      titulo: 'Restaurar backup?',
      msg: 'Os eventos e questões do arquivo vão substituir as versões atuais com o mesmo ID. O que não está no arquivo continua como está.',
      botao: 'Restaurar',
    });
    if (!ok) return;
    setOcupado('Lendo o arquivo…');
    try {
      const r = await restaurarBackup(await f.text(), setOcupado);
      avisar(`Restaurados ${r.eventos} eventos e ${r.questoes} questões.`);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setOcupado('');
    }
  }

  const linha = 'flex items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200';

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Ferramentas">
      <div className="grid gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          {usuario?.photoURL ? (
            <img src={usuario.photoURL} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
              {(usuario?.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{usuario?.displayName || 'Usuário'}</div>
            <div className="truncate text-xs text-slate-500">{usuario?.email}</div>
          </div>
          <Botao pequeno variante="fantasma" onClick={() => sair()}>
            <LogOut className="size-4" /> Sair
          </Botao>
        </div>

        <div className={linha}>
          <Sheet className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">Importar da planilha antiga</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Traz os eventos e as questões da planilha “Banco de Questões - Dados”. Só entra o que ainda não existe aqui, então pode repetir sem medo.
            </p>
            <Botao pequeno className="mt-2" onClick={importar} disabled={!ehGoogle || !!ocupado}>
              Importar
            </Botao>
            {!ehGoogle && <p className="mt-1 text-xs text-amber-700">Precisa estar logado com a conta Google dona da planilha.</p>}
            {resultado && (
              <ul className="mt-2 space-y-0.5 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900">
                <li>Eventos importados: <b>{resultado.eventosNovos}</b>{resultado.eventosJaExistiam ? ` (já existiam: ${resultado.eventosJaExistiam})` : ''}</li>
                <li>Questões importadas: <b>{resultado.questoesNovas}</b>{resultado.questoesJaExistiam ? ` (já existiam: ${resultado.questoesJaExistiam})` : ''}</li>
                {resultado.questoesSemEvento > 0 && (
                  <li className="text-amber-800">{resultado.questoesSemEvento} questão(ões) de teste sem evento correspondente foram guardadas, mas não aparecem em nenhum evento.</li>
                )}
                {resultado.avisos.map((a, i) => <li key={i} className="text-amber-800">{a}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className={linha}>
          <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">Backup</div>
            <p className="mt-0.5 text-xs text-slate-500">
              O plano gratuito do Firebase não faz backup sozinho. Baixe de vez em quando e guarde o arquivo .json.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Botao pequeno onClick={backup} disabled={!!ocupado}>
                <Download className="size-4" /> Baixar backup
              </Botao>
              <Botao pequeno variante="fantasma" onClick={() => arquivo.current?.click()} disabled={!!ocupado}>
                <FileUp className="size-4" /> Restaurar
              </Botao>
              <input
                ref={arquivo}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) restaurar(f);
                }}
              />
            </div>
          </div>
        </div>

        {ocupado && <p className="text-center text-xs font-medium text-slate-500">{ocupado}</p>}
        <p className="text-center text-xs text-slate-400">
          {eventos.length} eventos · {questoes.length} questões no banco
        </p>
      </div>
    </Modal>
  );
}
