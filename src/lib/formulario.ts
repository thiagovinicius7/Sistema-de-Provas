import type { Evento, Questao } from './types';
import { ordenarQuestoes } from './util';
import { rotuloFonte } from './fonte';

/**
 * Preenche o formulário da banca (FORMULARIO_MULTIPLA_ESCOLHA, 5 opções) com as questões ME do evento.
 *
 * O modelo (public/formulario-me.docx) é o formulário em branco da banca. Cada questão é uma tabela:
 *   linha 1  → última célula: nível de dificuldade (F/M/D)
 *   linha 2  → enunciado (célula larga)
 *   linhas 4–8 → 1ª célula: "G" vira "X" no gabarito; 3ª célula: texto das opções A–E
 *   linhas 10–14 → 2ª célula: item do conteúdo programático; 3ª célula: justificativa (e fonte)
 * As células cinza (uso interno da banca) não são alteradas. O modelo traz 10 tabelas de questão;
 * a primeira é usada como molde e repetida quantas vezes for preciso.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function filhos(el: Element, nome: string): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === nome);
}

function celulas(tr: Element) {
  return filhos(tr, 'tc');
}

function texto(el: Element) {
  return Array.from(el.getElementsByTagNameNS(W, 't'))
    .map((t) => t.textContent || '')
    .join('');
}

/** Troca o conteúdo da célula pelo texto (quebras de linha viram quebras do Word), mantendo a formatação do modelo. */
function escrever(doc: Document, tc: Element, valor: string) {
  const ps = filhos(tc, 'p');
  const p = ps[0] || tc.appendChild(doc.createElementNS(W, 'w:p'));
  ps.slice(1).forEach((x) => tc.removeChild(x));
  const r0 = filhos(p, 'r')[0];
  const rPr = r0 ? filhos(r0, 'rPr')[0] : undefined;
  Array.from(p.childNodes)
    .filter((n) => (n as Element).localName !== 'pPr')
    .forEach((n) => p.removeChild(n));
  const run = doc.createElementNS(W, 'w:r');
  if (rPr) run.appendChild(rPr.cloneNode(true));
  (valor || '').split('\n').forEach((linha, i) => {
    if (i) run.appendChild(doc.createElementNS(W, 'w:br'));
    const t = doc.createElementNS(W, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = linha;
    run.appendChild(t);
  });
  p.appendChild(run);
}

/** Troca só o número dentro do texto da célula (ex.: "§§QUESTÃO 1" → "§§QUESTÃO 7"). */
function renumerar(tc: Element, n: number) {
  const ts = Array.from(tc.getElementsByTagNameNS(W, 't'));
  const alvo = ts.find((t) => /\d+/.test(t.textContent || ''));
  if (alvo) alvo.textContent = (alvo.textContent || '').replace(/\d+/, String(n));
}

function letraGabarito(q: Questao): string {
  const g = (q.gab || '').trim().toUpperCase();
  if (/^[A-E]$/.test(g)) return g;
  const certa = q.itens.find((it) => /^cert/i.test(it.gab || ''));
  return (certa?.letra || '').toUpperCase();
}

/** "4.3 Controle florestal: manejo de…" → "4.3 Controle florestal" (número e título do tópico do edital). */
function itemProgramatico(edital: string) {
  const e = (edital || '').trim();
  const m = /^(\d+(?:\.\d+)*\.?\s+[^:;]{1,120}?)\s*[:;]/.exec(e);
  return m ? m[1].trim() : e;
}

function justificativa(it: Questao['itens'][number]) {
  const fonte = (it.fonte || '').trim();
  return [it.justificativa?.trim(), fonte ? `${rotuloFonte(fonte)}: ${fonte}` : ''].filter(Boolean).join('\n');
}

function preencherQuestao(doc: Document, tbl: Element, q: Questao, n: number) {
  const linhas = filhos(tbl, 'tr');
  renumerar(celulas(linhas[0])[1], n);
  const l1 = celulas(linhas[1]);
  renumerar(l1[2], n);
  escrever(doc, l1[l1.length - 1], q.dif || '');
  escrever(doc, celulas(linhas[2]).at(-1)!, q.enunciado || '');

  const gab = letraGabarito(q);
  const porLetra = new Map(q.itens.map((it, i) => [(it.letra || String.fromCharCode(65 + i)).toUpperCase(), it]));
  'ABCDE'.split('').forEach((letra, i) => {
    const it = porLetra.get(letra);
    const opcao = celulas(linhas[4 + i]);
    escrever(doc, opcao[0], letra === gab ? 'X' : 'G');
    escrever(doc, opcao[2], it?.texto || '');
    const just = celulas(linhas[10 + i]);
    escrever(doc, just[1], itemProgramatico(it?.edital || ''));
    escrever(doc, just[2], it ? justificativa(it) : '');
  });
}

/** Devolve o .docx preenchido (objeto JSZip), para gerar o arquivo no formato que precisar. */
export async function preencherFormularioME(e: Evento, questoes: Questao[], modelo: ArrayBuffer | Uint8Array) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(modelo);
  const arq = zip.file('word/document.xml');
  if (!arq) throw new Error('Modelo do formulário inválido.');
  const doc = new DOMParser().parseFromString(await arq.async('string'), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];

  // Cabeçalho: Elaborador(a) | Evento/Cargo | Quantidade de questões.
  const tabelas = filhos(body, 'tbl');
  const cab = celulas(filhos(tabelas[0], 'tr')[0]);
  const lista = ordenarQuestoes(questoes.filter((q) => q.tipo === 'ME'));
  escrever(doc, cab[3], [e.titulo, e.cargo].filter(Boolean).join(' – '));
  escrever(doc, cab[5], String(lista.length));

  // Tabelas de questão: a primeira vira molde, junto com os parágrafos que a seguem até a próxima.
  const deQuestao = tabelas.filter((t) => texto(t).includes('§§QUESTÃO'));
  if (!deQuestao.length) throw new Error('Modelo do formulário sem tabela de questão.');
  const primeira = deQuestao[0];
  const molde: Node[] = [primeira];
  for (let n = primeira.nextSibling; n && n !== deQuestao[1]; n = n.nextSibling) {
    if ((n as Element).localName === 'sectPr') break;
    molde.push(n);
  }
  const quebra = molde.slice(1); // parágrafos entre questões (o último tem a quebra de página)
  const fim = filhos(body, 'sectPr')[0] || null;
  // Remove todas as tabelas de questão e o que vem depois delas, exceto a seção final.
  for (let n: Node | null = primeira; n && n !== fim; ) {
    const prox = n.nextSibling;
    body.removeChild(n);
    n = prox;
  }

  lista.forEach((q, i) => {
    const tbl = primeira.cloneNode(true) as Element;
    preencherQuestao(doc, tbl, q, i + 1);
    body.insertBefore(tbl, fim);
    const seguintes = i < lista.length - 1 ? quebra : quebra.slice(0, 1);
    seguintes.forEach((n) => body.insertBefore(n.cloneNode(true), fim));
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip;
}

/** Gera o formulário preenchido em .docx, no próprio aparelho. */
export async function criarFormularioME(e: Evento, questoes: Questao[]): Promise<Blob> {
  const resp = await fetch(`${import.meta.env.BASE_URL}formulario-me.docx`);
  if (!resp.ok) throw new Error('Não foi possível carregar o modelo do formulário.');
  const zip = await preencherFormularioME(e, questoes, await resp.arrayBuffer());
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
