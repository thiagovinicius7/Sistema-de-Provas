import type { Evento, Questao } from './types';
import { dataBR, ordenarQuestoes } from './util';

/** Mesmo nome de arquivo do sistema antigo. */
export function nomeDaProva(e: Evento): string {
  const cargo = e.cargo ? ` - ${e.cargo}` : '';
  return `PROVA: ${e.titulo}${cargo} (${dataBR(e.data)})`;
}

interface Linha {
  rotulo: string;
  texto: string;
  nota?: string;
}

/** Monta o conteúdo da prova uma vez só; HTML e Word usam a mesma estrutura. */
function montar(e: Evento, questoes: Questao[]) {
  return ordenarQuestoes(questoes).map((q) => {
    const itens: Linha[] = q.itens.map((it, idx) => {
      const rotulo = q.tipo === 'ME' ? `${it.letra || String.fromCharCode(65 + idx)})` : `Item ${idx + 1}:`;
      const gab =
        q.tipo === 'ME'
          ? it.gab ? ` [Gab: ${it.gab}]` : ''
          : ` (Dif: ${it.dif || '-'} | Gab: ${it.gab || '-'})`;
      const temEdital = !!it.edital?.trim();
      const temJust = !!it.justificativa?.trim();
      const nota =
        temEdital || temJust
          ? '↳ ' +
            (temEdital ? `Edital: ${it.edital.trim()}` : '') +
            (temEdital && temJust ? ' | ' : '') +
            (temJust ? `Justificativa: ${it.justificativa.trim()}` : '')
          : undefined;
      return { rotulo: rotulo + gab, texto: it.texto || '', nota };
    });
    return {
      titulo: `QUESTÃO ${q.numero}: ${q.enunciado}`,
      dadosME: q.tipo === 'ME' ? `(Dificuldade: ${q.dif || '-'} | Gabarito: ${q.gab || '-'})` : '',
      itens,
    };
  });
}

function cabecalho(e: Evento) {
  return `Data: ${dataBR(e.data)} | Tipo: ${e.tipo}` + (e.cargo ? ` | Cargo: ${e.cargo}` : '');
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/** HTML que o Google Drive converte em Google Docs com a mesma formatação do sistema antigo. */
export function provaEmHtml(e: Evento, questoes: Questao[]): string {
  const blocos = montar(e, questoes)
    .map((q) => {
      const itens = q.itens
        .map(
          (it) =>
            `<p style="font-size:11pt;margin:0 0 ${it.nota ? 4 : 12}pt 0">${esc(it.rotulo)} ${esc(it.texto)}</p>` +
            (it.nota
              ? `<p style="font-size:9pt;font-style:italic;color:#666666;margin:0 0 12pt 35pt">${esc(it.nota)}</p>`
              : ''),
        )
        .join('');
      return (
        `<p style="font-size:12pt;font-weight:bold;margin:20pt 0 6pt 0">${esc(q.titulo)}</p>` +
        (q.dadosME
          ? `<p style="font-size:10pt;font-style:italic;color:#444444;margin:0 0 12pt 0">${esc(q.dadosME)}</p>`
          : '') +
        itens
      );
    })
    .join('');
  return (
    `<html><head><meta charset="utf-8"></head><body style="font-family:Arial">` +
    `<p style="text-align:center;font-size:14pt;font-weight:bold;margin:0">${esc(e.titulo.toUpperCase())}</p>` +
    `<p style="text-align:center;font-size:10pt;margin:0 0 10pt 0">${esc(cabecalho(e))}</p><hr>` +
    blocos +
    `</body></html>`
  );
}

/** Cria a prova como Google Docs no Drive da conta logada. Devolve o link. */
export async function criarNoGoogleDocs(e: Evento, questoes: Questao[], token: string): Promise<string> {
  const meta = { name: nomeDaProva(e), mimeType: 'application/vnd.google-apps.document' };
  const limite = 'provas' + Math.random().toString(36).slice(2);
  const corpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${limite}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${provaEmHtml(e, questoes)}\r\n` +
    `--${limite}--`;
  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${limite}` },
      body: corpo,
    },
  );
  if (!resp.ok) throw new Error(`O Google Drive recusou o arquivo (${resp.status}).`);
  const j = await resp.json();
  return j.webViewLink || `https://docs.google.com/document/d/${j.id}/edit`;
}

/** Gera a prova em Word (.docx), no próprio aparelho. */
export async function criarWord(e: Evento, questoes: Questao[]): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import('docx');
  const pt = (n: number) => n * 20; // espaçamento em twips
  const runs = (texto: string, opts: Record<string, unknown> = {}) =>
    texto.split('\n').map((parte, i) => new TextRun({ text: parte, break: i ? 1 : 0, font: 'Arial', ...opts }));

  const filhos: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: runs(e.titulo.toUpperCase(), { bold: true, size: 28 }),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: pt(10) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 4 } },
      children: runs(cabecalho(e), { size: 20 }),
    }),
  ];
  for (const q of montar(e, questoes)) {
    filhos.push(
      new Paragraph({
        spacing: { before: pt(20), after: pt(6) },
        children: runs(q.titulo, { bold: true, size: 24 }),
      }),
    );
    if (q.dadosME) {
      filhos.push(
        new Paragraph({
          spacing: { after: pt(12) },
          children: runs(q.dadosME, { italics: true, size: 20, color: '444444' }),
        }),
      );
    }
    for (const it of q.itens) {
      filhos.push(
        new Paragraph({
          spacing: { after: pt(it.nota ? 4 : 12) },
          children: runs(`${it.rotulo} ${it.texto}`, { size: 22 }),
        }),
      );
      if (it.nota) {
        filhos.push(
          new Paragraph({
            indent: { left: pt(35) },
            spacing: { after: pt(12) },
            children: runs(it.nota, { italics: true, size: 18, color: '666666' }),
          }),
        );
      }
    }
  }
  const doc = new Document({ sections: [{ children: filhos }] });
  return Packer.toBlob(doc);
}
