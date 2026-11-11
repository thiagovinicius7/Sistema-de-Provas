import type { Evento, Item, Questao } from './types';
import { ordenarQuestoes } from './util';
import { rotuloFonte } from './fonte';

/**
 * Preenche os formulários em branco da banca com as questões do evento.
 *
 * ME — public/formulario-me.docx (FORMULARIO_MULTIPLA_ESCOLHA, 5 opções). Cada questão é uma tabela:
 *   linha 1  → última célula: nível de dificuldade (F/M/D)
 *   linha 2  → enunciado (célula larga)
 *   linhas 4–8 → 1ª célula: "G" vira "X" no gabarito; 2ª célula (cinza): letras A–E automáticas;
 *               3ª célula: texto das opções
 *   linhas 10–14 → 2ª célula: item do edital, exatamente como cadastrado; 3ª célula: justificativa (e fonte)
 *   A primeira tabela vira molde e é repetida quantas vezes for preciso. As letras A–E da coluna Q
 *   são uma lista do Word: cada questão ganha a sua lista, que recomeça em A.
 *
 * CE — public/formulario-ce.docx (FORMULARIO_ITENS_CE). Uma tabela só:
 *   linha de comando (<<Dif/>> <<Gab/>> <<I#>> comando | edital | justificativa), seguida das linhas
 *   dos itens: dificuldade | gabarito C/E | nº automático (cinza) | item | /* | edital | justificativa | *\/
 *
 * Nos dois, a figura "exemplo de questão" é retirada e as células cinza (uso interno) não são alteradas.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function filhos(el: Element, nome: string): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === nome);
}

const celulas = (tr: Element) => filhos(tr, 'tc');

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
  const alvo = Array.from(tc.getElementsByTagNameNS(W, 't')).find((t) => /\d+/.test(t.textContent || ''));
  if (alvo) alvo.textContent = (alvo.textContent || '').replace(/\d+/, String(n));
}

/** Retira do corpo os parágrafos com figura (o "exemplo de questão" do modelo). */
function tirarFiguras(body: Element) {
  filhos(body, 'p')
    .filter((p) => p.getElementsByTagNameNS(W, 'drawing').length || p.getElementsByTagNameNS(W, 'pict').length)
    .forEach((p) => body.removeChild(p));
}

function justificativa(it: Item) {
  const fonte = (it.fonte || '').trim();
  return [it.justificativa?.trim(), fonte ? `${rotuloFonte(fonte)}: ${fonte}` : ''].filter(Boolean).join('\n');
}

function nomeDoEvento(e: Evento) {
  return [e.titulo, e.cargo].filter(Boolean).join(' – ');
}

async function abrir(modelo: ArrayBuffer | Uint8Array) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(modelo);
  const arq = zip.file('word/document.xml');
  if (!arq) throw new Error('Modelo do formulário inválido.');
  const doc = new DOMParser().parseFromString(await arq.async('string'), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  return { zip, doc, body };
}

// ---------------------------------------------------------------- ME

function letraGabarito(q: Questao): string {
  const g = (q.gab || '').trim().toUpperCase();
  if (/^[A-E]$/.test(g)) return g;
  const certa = q.itens.find((it) => /^cert/i.test(it.gab || ''));
  return (certa?.letra || '').toUpperCase();
}

/** Listas numeradas do modelo: cria cópias que recomeçam do início (uma por questão). */
function criadorDeListas(numeracao: Document | null) {
  const raiz = numeracao?.documentElement;
  let proximo = raiz ? Math.max(0, ...filhos(raiz, 'num').map((n) => Number(n.getAttributeNS(W, 'numId') || n.getAttribute('w:numId')) || 0)) + 1 : 0;
  return (numIdOriginal: string): string | null => {
    if (!raiz || !numeracao) return null;
    const original = filhos(raiz, 'num').find((n) => (n.getAttributeNS(W, 'numId') || n.getAttribute('w:numId')) === numIdOriginal);
    const abs = original && filhos(original, 'abstractNumId')[0];
    if (!abs) return null;
    const id = String(proximo++);
    const num = numeracao.createElementNS(W, 'w:num');
    num.setAttributeNS(W, 'w:numId', id);
    const a = numeracao.createElementNS(W, 'w:abstractNumId');
    a.setAttributeNS(W, 'w:val', abs.getAttributeNS(W, 'val') || abs.getAttribute('w:val') || '0');
    num.appendChild(a);
    const ov = numeracao.createElementNS(W, 'w:lvlOverride');
    ov.setAttributeNS(W, 'w:ilvl', '0');
    const st = numeracao.createElementNS(W, 'w:startOverride');
    st.setAttributeNS(W, 'w:val', '1');
    ov.appendChild(st);
    num.appendChild(ov);
    // w:num fica depois dos w:abstractNum e antes de w:numIdMacAtCleanup, se houver.
    const limpeza = filhos(raiz, 'numIdMacAtCleanup')[0] || null;
    raiz.insertBefore(num, limpeza);
    return id;
  };
}

function preencherQuestaoME(doc: Document, tbl: Element, q: Questao, n: number, novaLista: (id: string) => string | null) {
  const linhas = filhos(tbl, 'tr');
  renumerar(celulas(linhas[0])[1], n);
  const l1 = celulas(linhas[1]);
  renumerar(l1[2], n);
  escrever(doc, l1[l1.length - 1], q.dif || '');
  escrever(doc, celulas(linhas[2]).at(-1)!, q.enunciado || '');

  // Letras A–E da coluna Q: lista própria desta questão, recomeçando em A.
  const trocas = new Map<string, string | null>();
  for (let i = 4; i <= 8; i++) {
    for (const numId of Array.from(celulas(linhas[i])[1].getElementsByTagNameNS(W, 'numId'))) {
      const orig = numId.getAttributeNS(W, 'val') || numId.getAttribute('w:val') || '';
      if (!trocas.has(orig)) trocas.set(orig, novaLista(orig));
      const novo = trocas.get(orig);
      if (novo) numId.setAttributeNS(W, 'w:val', novo);
    }
  }

  const gab = letraGabarito(q);
  const porLetra = new Map(q.itens.map((it, i) => [(it.letra || String.fromCharCode(65 + i)).toUpperCase(), it]));
  'ABCDE'.split('').forEach((letra, i) => {
    const it = porLetra.get(letra);
    const opcao = celulas(linhas[4 + i]);
    escrever(doc, opcao[0], letra === gab ? 'X' : 'G');
    escrever(doc, opcao[2], it?.texto || '');
    const just = celulas(linhas[10 + i]);
    escrever(doc, just[1], it?.edital || '');
    escrever(doc, just[2], it ? justificativa(it) : '');
  });
}

/** Devolve o .docx ME preenchido (objeto JSZip). */
export async function preencherFormularioME(e: Evento, questoes: Questao[], modelo: ArrayBuffer | Uint8Array) {
  const { zip, doc, body } = await abrir(modelo);
  tirarFiguras(body);

  const arqNum = zip.file('word/numbering.xml');
  const numeracao = arqNum ? new DOMParser().parseFromString(await arqNum.async('string'), 'application/xml') : null;
  const novaLista = criadorDeListas(numeracao);

  // Cabeçalho: Elaborador(a) | Evento/Cargo | Quantidade de questões.
  const tabelas = filhos(body, 'tbl');
  const cab = celulas(filhos(tabelas[0], 'tr')[0]);
  const lista = ordenarQuestoes(questoes.filter((q) => q.tipo === 'ME'));
  escrever(doc, cab[3], nomeDoEvento(e));
  escrever(doc, cab[5], String(lista.length));

  // Tabelas de questão: a primeira vira molde, junto com os parágrafos que a seguem até a próxima.
  const deQuestao = tabelas.filter((t) => texto(t).includes('§§QUESTÃO'));
  if (!deQuestao.length) throw new Error('Modelo do formulário sem tabela de questão.');
  const primeira = deQuestao[0];
  const quebra: Node[] = [];
  for (let n = primeira.nextSibling; n && n !== deQuestao[1]; n = n.nextSibling) {
    if ((n as Element).localName === 'sectPr') break;
    quebra.push(n); // parágrafos entre questões (o último tem a quebra de página)
  }
  const fim = filhos(body, 'sectPr')[0] || null;
  for (let n: Node | null = primeira; n && n !== fim; ) {
    const prox = n.nextSibling;
    body.removeChild(n);
    n = prox;
  }

  lista.forEach((q, i) => {
    const tbl = primeira.cloneNode(true) as Element;
    preencherQuestaoME(doc, tbl, q, i + 1, novaLista);
    body.insertBefore(tbl, fim);
    const seguintes = i < lista.length - 1 ? quebra : quebra.slice(0, 1);
    seguintes.forEach((n) => body.insertBefore(n.cloneNode(true), fim));
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  if (numeracao) zip.file('word/numbering.xml', new XMLSerializer().serializeToString(numeracao));
  return zip;
}

// ---------------------------------------------------------------- CE

function gabaritoCE(g: string) {
  const v = (g || '').trim().toLowerCase();
  if (v === 'c' || v.startsWith('cert')) return 'C';
  if (v === 'e' || v.startsWith('err')) return 'E';
  return (g || '').trim().toUpperCase();
}

/** Devolve o .docx CE preenchido (objeto JSZip). */
export async function preencherFormularioCE(e: Evento, questoes: Questao[], modelo: ArrayBuffer | Uint8Array) {
  const { zip, doc, body } = await abrir(modelo);
  tirarFiguras(body);

  const lista = ordenarQuestoes(questoes.filter((q) => q.tipo === 'CE'));
  const tabelas = filhos(body, 'tbl');

  // Cabeçalho: Elaborador(a) | Cargo | Quantidade de itens.
  const tabCab = tabelas.find((t) => texto(t).includes('Quantidade de Itens'));
  if (tabCab) {
    const cab = celulas(filhos(tabCab, 'tr')[0]);
    escrever(doc, cab[3], nomeDoEvento(e));
    escrever(doc, cab[5], String(lista.reduce((s, q) => s + q.itens.length, 0)));
  }

  const tbl = tabelas.find((t) => texto(t).includes('<<I#>>'));
  if (!tbl) throw new Error('Modelo do formulário sem a tabela de itens.');
  const linhas = filhos(tbl, 'tr');
  const comandos = linhas.filter((tr) => texto(tr).includes('<<Dif/>>'));
  const itemModelo = linhas.find((tr) => texto(tr).includes('/*'));
  if (!comandos.length || !itemModelo) throw new Error('Modelo do formulário CE fora do padrão.');
  const comandoPrimeiro = comandos[0]; // traz as instruções da banca nos títulos
  const comandoDemais = comandos[1] || comandos[0];
  linhas.forEach((tr) => tbl.removeChild(tr));

  lista.forEach((q, qi) => {
    const cmd = (qi === 0 ? comandoPrimeiro : comandoDemais).cloneNode(true) as Element;
    escrever(doc, celulas(cmd)[3], q.enunciado || '');
    tbl.appendChild(cmd);
    for (const it of q.itens) {
      const tr = itemModelo.cloneNode(true) as Element;
      const c = celulas(tr);
      escrever(doc, c[0], it.dif || '');
      escrever(doc, c[1], gabaritoCE(it.gab));
      escrever(doc, c[3], it.texto || '');
      escrever(doc, c[5], it.edital || '');
      escrever(doc, c[6], justificativa(it));
      tbl.appendChild(tr);
    }
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip;
}

// ---------------------------------------------------------------- arquivo

/** Gera o formulário da banca do tipo do evento (ME ou CE), em .docx, no próprio aparelho. */
export async function criarFormulario(e: Evento, questoes: Questao[]): Promise<Blob> {
  const arquivo = e.tipo === 'CE' ? 'formulario-ce.docx' : 'formulario-me.docx';
  const resp = await fetch(`${import.meta.env.BASE_URL}${arquivo}`);
  if (!resp.ok) throw new Error('Não foi possível carregar o modelo do formulário.');
  const modelo = await resp.arrayBuffer();
  const zip = e.tipo === 'CE' ? await preencherFormularioCE(e, questoes, modelo) : await preencherFormularioME(e, questoes, modelo);
  return zip.generateAsync({ type: 'blob', mimeType: MIME_DOCX });
}
