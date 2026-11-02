import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut,
  connectAuthEmulator,
  signInWithCredential,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-config.json';

/** Falso enquanto o firebase-config.json ainda tem os valores de exemplo. */
export const firebaseConfigurado = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && v.trim() !== '' && v !== 'COLE_AQUI',
);

const app = initializeApp(
  firebaseConfigurado ? firebaseConfig : { apiKey: 'x', projectId: 'nao-configurado', appId: 'x' },
);

// Sem cache em disco: as questões de prova não ficam guardadas no aparelho.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalAutoDetectLongPolling: true,
});

export const auth = getAuth(app);

// Só para testes locais com o emulador do Firebase (nunca ativo no site publicado).
if (import.meta.env.VITE_EMULADOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  (window as any).__entrarTeste = (email: string) =>
    signInWithCredential(
      auth,
      GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: 'Teste' })),
    );
}

const provedorLogin = new GoogleAuthProvider();
provedorLogin.setCustomParameters({ prompt: 'select_account' });

export function entrarComGoogle() {
  return signInWithPopup(auth, provedorLogin);
}

export function sair() {
  tokenGoogle = null;
  return signOut(auth);
}

// ---------- Acesso ao Google Drive / Planilhas (só quando precisa) ----------

export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const ESCOPO_PLANILHAS = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let tokenGoogle: { token: string; escopos: string[]; validoAte: number } | null = null;

/**
 * Pede à conta Google logada uma autorização temporária para o Drive ou para
 * ler planilhas. Abre uma janela do Google na primeira vez (e depois de 50 min).
 * Precisa ser chamada a partir de um clique, senão o navegador bloqueia a janela.
 */
export async function obterTokenGoogle(escopos: string[]): Promise<string> {
  const agora = Date.now();
  if (
    tokenGoogle &&
    tokenGoogle.validoAte > agora &&
    escopos.every((e) => tokenGoogle!.escopos.includes(e))
  ) {
    return tokenGoogle.token;
  }
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Faça login novamente.');
  const ehGoogle = usuario.providerData.some((p) => p.providerId === 'google.com');
  if (!ehGoogle) throw new Error('Essa função só funciona com login Google.');

  const provedor = new GoogleAuthProvider();
  escopos.forEach((e) => provedor.addScope(e));
  provedor.setCustomParameters({ login_hint: usuario.email || '' });
  const res = await reauthenticateWithPopup(usuario, provedor);
  const cred = GoogleAuthProvider.credentialFromResult(res);
  if (!cred?.accessToken) throw new Error('O Google não liberou o acesso.');
  tokenGoogle = { token: cred.accessToken, escopos, validoAte: agora + 50 * 60 * 1000 };
  return cred.accessToken;
}
