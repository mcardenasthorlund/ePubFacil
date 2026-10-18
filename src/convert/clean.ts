/**
 * Helpers to detect and remove running headers/footers and page numbers that
 * would otherwise end up embedded in the book text.
 */

/** Normalizes a line for repetition detection (case/space/digit insensitive). */
export function normalizeLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the whole string looks like a page number ("6", "- 12 -", "3/10", "Página 7", "iv"). */
export function isPageNumber(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/^[-–—\s]*(?:p[aá]g(?:ina)?\.?\s*)?\d{1,4}(?:\s*(?:\/|de)\s*\d{1,4})?[-–—\s]*$/.test(t)) {
    return true;
  }
  if (/^[-–—\s]*[ivxlcdm]{2,7}[-–—\s]*$/.test(t)) {
    return true;
  }
  return false;
}

/** True when the text starts or ends with a short number token (page-number like). */
export function hasEdgeNumber(text: string): boolean {
  const t = text.trim();
  return /^\s*[-–—\s]*\d{1,4}\b/.test(t) || /\b\d{1,4}\s*[-–—\s]*$/.test(t);
}

/**
 * Removes paragraphs that consist solely of a page number. Applied to every
 * input format as a safety net.
 */
export function stripPageNumberParagraphs(html: string): string {
  if (!/<p[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('p').forEach((p) => {
    if (p.querySelector('img, figure, table')) return;
    const text = (p.textContent || '').trim();
    if (text && isPageNumber(text)) p.remove();
  });
  return doc.body.innerHTML;
}
