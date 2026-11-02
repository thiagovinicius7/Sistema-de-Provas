import type { Questao } from './types';

/** Separa o trecho "Fonte: …" de uma justificativa antiga. Não descarta nada. */
export function separarFonte(justificativa: string): { justificativa: string; fonte: string } {
  const j = justificativa || '';
  const m = /(^|[\s.;])Fontes?\s*:\s*/i.exec(j);
  if (!m) return { justificativa: j, fonte: '' };
  const corte = m.index + m[1].length;
  const fonte = j.slice(m.index + m[0].length).trim();
  if (!fonte) return { justificativa: j, fonte: '' };
  return { justificativa: j.slice(0, corte).trim(), fonte };
}

/** "Item certo." / "Item errado." conforme o gabarito do item (C/E ou certa/errada). */
export function prefixoDoGabarito(gab: string): string {
  const g = (gab || '').trim().toLowerCase();
  if (g === 'c' || g === 'certa' || g === 'certo') return 'Item certo.';
  if (g === 'e' || g === 'errada' || g === 'errado') return 'Item errado.';
  return '';
}

const PALAVRA_EXISTENTE = /^(\s*)item\s+(certo|errado|certa|errada|correto|incorreto)\b/i;

/**
 * Coloca (ou troca) o "Item certo." / "Item errado." no começo da justificativa.
 * Se o texto já começa com "Item certo/errado", troca só a palavra e mantém a pontuação
 * que vinha depois (ex.: "Item certo, pois…" vira "Item errado, pois…").
 */
export function aplicarPrefixo(justificativa: string, gab: string): string {
  const j = justificativa || '';
  const prefixo = prefixoDoGabarito(gab);
  const m = PALAVRA_EXISTENTE.exec(j);
  if (m) {
    if (!prefixo) return j; // gabarito apagado: não mexe no texto
    return prefixo.replace(/\.$/, '') + j.slice(m[0].length);
  }
  if (!prefixo) return j;
  return j.trim() ? `${prefixo} ${j.trimStart()}` : `${prefixo} `;
}

function chave(f: string) {
  return f.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Fontes já usadas em todas as questões, das mais usadas para as menos usadas.
 * Quando uma justificativa tem várias referências (uma por linha), cada uma entra na lista.
 */
export function catalogoDeFontes(questoes: Questao[]): string[] {
  const cont = new Map<string, { texto: string; n: number }>();
  for (const q of questoes) {
    for (const it of q.itens) {
      const bruto = it.fonte || separarFonte(it.justificativa).fonte;
      const linhas = bruto.split(/\n|\t|•/).map((l) => l.replace(/\s+/g, ' ').replace(/^[\s.;,–-]+/, '').trim()).filter((l) => l.length >= 15);
      for (const f of linhas) {
        const k = chave(f);
        const atual = cont.get(k);
        if (atual) atual.n++;
        else cont.set(k, { texto: f, n: 1 });
      }
    }
  }
  return [...cont.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto)).map((x) => x.texto);
}

/** "Fonte" ou "Fontes", conforme haja uma ou várias referências. */
export function rotuloFonte(fonte: string): string {
  return fonte.trim().includes('\n') ? 'Fontes' : 'Fonte';
}
