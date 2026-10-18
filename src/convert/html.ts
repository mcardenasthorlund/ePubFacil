import type { ExtractionResult } from '../types';
import { ImageRegistry } from './images';
import { sanitizeHtml, splitIntoChapters, countWords, firstH1 } from './toChapters';

/**
 * Converts an HTML document into the intermediate representation. Embedded
 * data-URL images are captured; remote images are dropped (offline policy).
 */
export function convertHtml(fileName: string, content: string): ExtractionResult {
  const registry = new ImageRegistry();
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(content, 'text/html');

  const titleTag = doc.querySelector('title')?.textContent?.trim() ?? '';
  const authorMeta =
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ??
    doc.querySelector('meta[property="article:author"]')?.getAttribute('content')?.trim() ??
    '';

  const sourceBody = doc.body?.innerHTML ?? content;
  let sanitized = sanitizeHtml(sourceBody);
  const beforeImgs = (sanitized.match(/<img/gi) || []).length;
  sanitized = registry.rewriteDataUrls(sanitized);
  const dropped = beforeImgs - registry.images.length;
  if (dropped > 0) {
    warnings.push(`${dropped} imagen(es) remota(s) omitida(s) por política sin conexión.`);
  }

  const fallbackTitle = titleTag || fileName || 'Documento';
  const finalTitle = titleTag || firstH1(sanitized) || fallbackTitle;
  const chapters = splitIntoChapters(sanitized, finalTitle);

  return {
    title: finalTitle,
    author: authorMeta,
    chapters,
    images: registry.images,
    wordCount: chapters.reduce((sum, c) => sum + countWords(c.html), 0),
    warnings,
  };
}
