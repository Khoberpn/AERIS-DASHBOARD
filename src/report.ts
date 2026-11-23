const pdfEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?');

/** Creates a dependency-free, text-based PDF suitable for dashboard snapshots. */
export function downloadPdf(filename: string, title: string, lines: string[]) {
  const wrapped = lines.flatMap(line => {
    const text = String(line);
    if (text.length <= 92) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 92) chunks.push(text.slice(i, i + 92));
    return chunks;
  });
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += 46) pages.push(wrapped.slice(i, i + 46));
  if (!pages.length) pages.push([]);
  const objects: string[] = [];
  const pageIds: number[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((page) => {
    const content = [`BT /F1 16 Tf 50 790 Td (${pdfEscape(title)}) Tj /F1 9 Tf 0 -24 Td`, ...page.flatMap((line, lineIndex) => [lineIndex ? '0 -15 Td' : '', `(${pdfEscape(line)}) Tj`]), 'ET'].join(' ');
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const output = ['%PDF-1.4'];
  const offsets: number[] = [0];
  objects.forEach((body, index) => { offsets[index + 1] = output.join('\n').length + 1; output.push(`${index + 1} 0 obj\n${body.replace('PAGES_ID', String(pagesId))}\nendobj`); });
  const xref = output.join('\n').length + 1;
  output.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const blob = new Blob([output.join('\n')], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
