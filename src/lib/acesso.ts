/**
 * Quem pode usar o sistema. Esta lista só controla o que a tela mostra;
 * quem protege os dados de verdade é o firestore.rules, que tem a mesma lista.
 * Para mudar, altere os dois arquivos.
 */
export const EMAIL_DONO = 'thiagovinicius7@gmail.com';

/** Usuário de e-mail/senha do Claude, com perfil de editor. */
export const EMAIL_CLAUDE = 'claude@sitioescolageranium.com.br';

export function emailAutorizado(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e === EMAIL_DONO || e === EMAIL_CLAUDE;
}
