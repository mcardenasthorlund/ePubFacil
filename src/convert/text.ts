import { marked } from 'marked';
import type { ExtractionResult } from '../types';
import { ImageRegistry } from './images';
import { sanitizeHtml, splitIntoChapters, countWords, firstH1 } from './toChapters';

const HEADING_WORDS =
  /^(cap[íi]tulo|chapter|parte|part|secci[óo]n|section|prólogo|prologo|epílogo|epilogo|introducci[óo]n|introduction|prefacio|ap[ée]ndice|apendice|conclusi[óo]n)\b/i;

function looksLikeHeading(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 90) return false;
  if (HEADING_WORDS.test(text)) return true;
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase() && /[A-ZÀ-Ý]/.test(letters)) {
    return true;
  }
  // Title Case single line without trailing punctuation.
  if (/[.!?,;:]$/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length <= 8) {
    const capitalized = words.filter((w) => /^[A-ZÀ-Ý]/.test(w)).length;
    if (capitalized === words.length && words.length >= 2) return true;
  }
  return false;
}

function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    if (lines.length === 1 && looksLikeHeading(trimmed)) {
      out.push(`<h1>${escapeHtml(trimmed)}</h1>`);
    } else {
      const inner = lines.map((l) => escapeHtml(l.trim())).join('<br>');
      out.push(`<p>${inner}</p>`);
    }
  }
  return out.join('\n');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function convertText(fileName: string, content: string, isMarkdown: boolean): ExtractionResult {
  const registry = new ImageRegistry();
  const warnings: string[] = [];

  let bodyHtml: string;
  if (isMarkdown) {
    const parsed = marked.parse(content, { async: false, gfm: true, breaks: false });
    bodyHtml = typeof parsed === 'string' ? parsed : '';
  } else {
    bodyHtml = textToHtml(content);
  }

  let sanitized = sanitizeHtml(bodyHtml);
  sanitized = registry.rewriteDataUrls(sanitized);

  const fallbackTitle = fileName || 'Documento';
  const title = firstH1(sanitized) || fallbackTitle;
  const chapters = splitIntoChapters(sanitized, title);

  return {
    title,
    author: '',
    chapters,
    images: registry.images,
    wordCount: chapters.reduce((sum, c) => sum + countWords(c.html), 0),
    warnings,
  };
}
