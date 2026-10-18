import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExtractionResult, ImportMode } from '../types';
import { ImageRegistry } from './images';
import { sanitizeHtml, splitIntoChapters, countWords, firstH1 } from './toChapters';
import { isPageNumber, hasEdgeNumber, normalizeLine, stripPageNumberParagraphs } from './clean';
import { recognizeImage } from './ocr';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>;

export interface PdfOptions {
  mode: ImportMode;
  ocr: boolean;
  ocrLang: string;
  onProgress?: (percent: number, status: string) => void;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface TextLine {
  y: number;
  x: number;
  fontSize: number;
  text: string;
}

interface PageDatum {
  pageNum: number;
  pageHeight: number;
  lines: TextLine[];
  headingPrefix: string;
  imagesHtml: string;
  /** Pre-built HTML that bypasses the line pipeline (image/OCR-only pages). */
  rawHtml?: string;
}

export async function convertPdf(
  fileName: string,
  arrayBuffer: ArrayBuffer,
  options: PdfOptions
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const registry = new ImageRegistry();
  const progress = options.onProgress ?? (() => {});

  progress(2, 'Abriendo el PDF…');
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let title = '';
  let author = '';
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown>;
    title = String(info?.Title ?? '').trim();
    author = String(info?.Author ?? '').trim();
  } catch {
    /* metadata optional */
  }

  const outlineByPage = await resolveOutline(doc);
  const total = doc.numPages;
  const pages: PageDatum[] = [];
  let ocrUsed = false;

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const pct = Math.round(5 + (pageNum / total) * 88);
    progress(pct, `Procesando página ${pageNum}/${total}…`);
    const page = await doc.getPage(pageNum);
    await yieldToUi();

    const pageHeight = page.getViewport({ scale: 1 }).height || 0;
    const outlineTitle = outlineByPage.get(pageNum);
    const headingPrefix = outlineTitle ? `<h1>${escapeHtml(outlineTitle)}</h1>` : '';

    if (options.mode === 'image') {
      const ref = await renderPageToImage(page, registry, 1.6);
      pages.push({
        pageNum,
        pageHeight,
        lines: [],
        headingPrefix,
        imagesHtml: '',
        rawHtml: `${headingPrefix}<figure><img src="${ref}" alt=""></figure>`,
      });
      continue;
    }

    const text = await page.getTextContent();
    const lines = buildLines(text.items as PdfTextItem[]);

    if (lines.length === 0) {
      const result = await handleImageOnlyPage(page, registry, pageNum, headingPrefix, options, progress, pct, warnings);
      if (result.ocrUsed) ocrUsed = true;
      pages.push({ pageNum, pageHeight, lines: [], headingPrefix, imagesHtml: '', rawHtml: result.html });
      continue;
    }

    const imagesHtml = await extractPageImages(page, registry);
    pages.push({ pageNum, pageHeight, lines, headingPrefix, imagesHtml });
  }

  if (options.mode === 'reflow' && ocrUsed) {
    warnings.push('Se aplicó reconocimiento de texto (OCR) en páginas sin texto digital.');
  }

  // Second pass: drop running headers/footers and page numbers.
  const drops = computeHeaderFooterLines(pages);
  const htmlParts = pages.map((pd, idx) => {
    if (pd.rawHtml !== undefined) return pd.rawHtml;
    const dropSet = drops.get(idx);
    const kept = dropSet ? pd.lines.filter((_, i) => !dropSet.has(i)) : pd.lines;
    const effective = kept.length > 0 ? kept : pd.lines;
    return `${pd.headingPrefix}${linesToHtml(effective)}${pd.imagesHtml}`;
  });

  let html = sanitizeHtml(htmlParts.join('\n'));
  html = stripPageNumberParagraphs(html);

  const fallbackTitle = title || fileName || 'Documento';
  const finalTitle = title || firstH1(html) || fallbackTitle;
  const chapters = splitIntoChapters(html, finalTitle);

  return {
    title: finalTitle,
    author,
    chapters,
    images: registry.images,
    wordCount: chapters.reduce((sum, c) => sum + countWords(c.html), 0),
    warnings,
  };
}

/** Renders/OCRs a page that has no extractable text and returns its HTML. */
async function handleImageOnlyPage(
  page: PdfPage,
  registry: ImageRegistry,
  pageNum: number,
  headingPrefix: string,
  options: PdfOptions,
  progress: (percent: number, status: string) => void,
  pct: number,
  warnings: string[]
): Promise<{ html: string; ocrUsed: boolean }> {
  if (options.ocr) {
    progress(pct, `Aplicando OCR a la página ${pageNum}…`);
    try {
      const ref = await renderPageToImage(page, registry, 2.0);
      const blob = registry.get(ref)?.blob;
      if (blob) {
        const recognized = await recognizeImage(blob, options.ocrLang, (p, status) => {
          progress(pct, `OCR página ${pageNum}: ${status} ${p}%`);
        });
        if (recognized) {
          const paragraphs = recognized
            .split(/\n{2,}|\n(?=[A-ZÁÉÍÓÚÑ][^\n]*$)/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => `<p>${escapeHtml(t.replace(/\n/g, ' '))}</p>`)
            .join('');
          return { html: `${headingPrefix}${paragraphs}`, ocrUsed: true };
        }
        return {
          html: `${headingPrefix}<figure><img src="${ref}" alt="Página ${pageNum}"></figure>`,
          ocrUsed: true,
        };
      }
    } catch (err) {
      warnings.push(`OCR falló en la página ${pageNum}: ${(err as Error).message}`);
      const ref = await renderPageToImage(page, registry, 1.6);
      return {
        html: `${headingPrefix}<figure><img src="${ref}" alt="Página ${pageNum}"></figure>`,
        ocrUsed: false,
      };
    }
  }
  const ref = await renderPageToImage(page, registry, 1.6);
  return {
    html: `${headingPrefix}<figure><img src="${ref}" alt="Página ${pageNum}"></figure>`,
    ocrUsed: false,
  };
}

function zoneOf(line: TextLine, pageHeight: number, zone: number): 'h' | 'f' | null {
  if (pageHeight <= 0) return null;
  const rel = line.y / pageHeight;
  if (rel >= 1 - zone) return 'h';
  if (rel <= zone) return 'f';
  return null;
}

/**
 * Identifies header/footer lines: page numbers, and short lines repeating in the
 * top/bottom margins across many pages (running titles). Returns, per page
 * index, the set of line indices to drop.
 */
function computeHeaderFooterLines(pages: PageDatum[]): Map<number, Set<number>> {
  const edgeZone = 0.08; // page numbers and short edge lines
  const repeatZone = 0.16; // running headers/footers sit a bit further in
  const withLines = pages.filter((p) => p.lines.length > 0).length;
  const counts = new Map<string, number>();

  pages.forEach((pd) => {
    pd.lines.forEach((line) => {
      const z = zoneOf(line, pd.pageHeight, repeatZone);
      if (!z) return;
      const key = `${z}|${normalizeLine(line.text)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  const threshold = Math.max(2, Math.ceil(withLines * 0.1));
  const drops = new Map<number, Set<number>>();

  pages.forEach((pd, idx) => {
    if (pd.lines.length === 0) return;
    const set = new Set<number>();
    pd.lines.forEach((line, li) => {
      const text = line.text.trim();
      const zEdge = zoneOf(line, pd.pageHeight, edgeZone);
      const zRepeat = zoneOf(line, pd.pageHeight, repeatZone);
      if (!zEdge && !zRepeat) return;

      const repeat =
        !!zRepeat &&
        text.length <= 80 &&
        (counts.get(`${zRepeat}|${normalizeLine(text)}`) ?? 0) >= threshold;

      if ((zEdge && isPageNumber(text)) || repeat || (zEdge && hasEdgeNumber(text) && text.length <= 70)) {
        set.add(li);
      }
    });
    // Never remove every line of a page (avoid empty pages).
    if (set.size === pd.lines.length) set.clear();
    if (set.size > 0) drops.set(idx, set);
  });

  return drops;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

/** Groups PDF text items into visual lines, then sorts them top-to-bottom. */
function buildLines(items: PdfTextItem[]): TextLine[] {
  const glyphs = items
    .filter((it) => typeof it.str === 'string' && it.str.trim().length > 0)
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      fontSize: it.height || Math.abs(it.transform[3]) || 10,
    }));

  if (glyphs.length === 0) return [];

  glyphs.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  const medianSize = median(glyphs.map((g) => g.fontSize));
  const yTolerance = Math.max(2, medianSize * 0.4);

  let current: { y: number; items: typeof glyphs } | null = null;
  for (const g of glyphs) {
    if (!current || Math.abs(g.y - current.y) > yTolerance) {
      if (current) lines.push(finishLine(current));
      current = { y: g.y, items: [g] };
    } else {
      current.items.push(g);
    }
  }
  if (current) lines.push(finishLine(current));

  return lines;
}

function finishLine(line: { y: number; items: { str: string; x: number; fontSize: number }[] }): TextLine {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  let text = '';
  let prevEnd: number | null = null;
  for (const it of items) {
    const approxCharWidth = (it.fontSize || 10) * 0.5;
    if (prevEnd !== null && it.x - prevEnd > approxCharWidth * 0.6 && !/\s$/.test(text)) {
      text += ' ';
    }
    text += it.str;
    prevEnd = it.x + it.str.length * approxCharWidth;
  }
  const fontSize = Math.max(...items.map((i) => i.fontSize || 10));
  return { y: line.y, x: items[0]?.x ?? 0, fontSize, text: text.replace(/\s+/g, ' ').trim() };
}

/** Turns lines into paragraphs, promoting larger fonts to headings. */
function linesToHtml(lines: TextLine[]): string {
  const bodySize = median(lines.map((l) => l.fontSize)) || 10;
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = Math.abs(lines[i - 1].y - lines[i].y);
    if (g > 0) gaps.push(g);
  }
  const medianGap = median(gaps) || bodySize * 1.4;

  const out: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ratio = line.fontSize / bodySize;
    const prev = lines[i - 1];
    const gap = prev ? Math.abs(prev.y - line.y) : Infinity;

    // A heading must be visibly larger than the body and look title-like
    // (short, few words, no sentence punctuation, not a dialogue line).
    const words = line.text.split(/\s+/).length;
    const isHeading =
      ratio >= 1.3 &&
      line.text.length <= 64 &&
      words <= 9 &&
      !/[.,;:!?»")\]]$/.test(line.text) &&
      !/^[-–—•*]/.test(line.text) &&
      !/^[«"']/.test(line.text);
    if (isHeading) {
      flush();
      const level = ratio >= 1.6 ? 1 : 2;
      out.push(`<h${level}>${escapeHtml(line.text)}</h${level}>`);
      continue;
    }

    const newParagraph =
      paragraph.length > 0 &&
      (gap > medianGap * 1.6 || (/[.!?:»")]$/.test(paragraph[paragraph.length - 1]) && gap > medianGap * 1.25));

    if (newParagraph) flush();
    paragraph.push(line.text);
  }
  flush();

  return out.join('\n');
}

/** Renders a PDF page to a PNG blob and registers it as an image. */
async function renderPageToImage(page: PdfPage, registry: ImageRegistry, scale: number): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport } as never).promise;
  const blob = await canvasToBlob(canvas, 'image/png');
  return registry.add(blob, canvas.width, canvas.height);
}

/** Best-effort extraction of embedded images on a page (guarded, may return ''). */
async function extractPageImages(page: PdfPage, registry: ImageRegistry): Promise<string> {
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS as Record<string, number>;
    const names: string[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
        const arg = ops.argsArray[i]?.[0];
        if (typeof arg === 'string' && !names.includes(arg)) names.push(arg);
      }
    }
    let html = '';
    for (const name of names.slice(0, 8)) {
      const obj = await getPdfObject(page, name);
      let blob: Blob | null = null;
      try {
        blob = await pdfImageObjectToBlob(obj);
      } catch {
        blob = null;
      }
      if (!blob) continue;
      const ref = registry.add(blob);
      html += `<figure><img src="${ref}" alt=""></figure>`;
    }
    return html;
  } catch {
    return '';
  }
}

function getPdfObject(page: PdfPage, name: string): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: unknown) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const objs = page.objs as unknown as {
        get: (id: string, cb?: (obj: unknown) => void) => unknown;
      };
      // Passing a callback registers it when unresolved AND returns the value
      // immediately when the object is already available.
      const value = objs.get(name, done);
      if (value !== undefined && value !== null) done(value);
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 2500);
  });
}

async function maybeAwait<T>(value: T | Promise<T>): Promise<T | null> {
  if (value && typeof (value as { then?: unknown }).then === 'function') {
    try {
      return await (value as Promise<T>);
    } catch {
      return null;
    }
  }
  return value as T;
}

async function pdfImageObjectToBlob(obj: unknown): Promise<Blob | null> {
  if (!obj || typeof obj !== 'object') return null;
  const img = obj as {
    data?: Uint8Array | Uint8ClampedArray | Promise<Uint8Array | Uint8ClampedArray>;
    width?: number;
    height?: number;
    bitmap?: ImageBitmap | Promise<ImageBitmap | null> | null;
  };

  const width = img.width ?? 0;
  const height = img.height ?? 0;

  // Path 1: an ImageBitmap or VideoFrame (possibly wrapped in a promise).
  const bmp = await maybeAwait(img.bitmap as ImageBitmap | Promise<ImageBitmap | null>);
  if (bmp && typeof bmp === 'object') {
    const source = bmp as unknown as {
      width?: number;
      height?: number;
      displayWidth?: number;
      displayHeight?: number;
      codedWidth?: number;
      codedHeight?: number;
      close?: () => void;
    };
    const bw = source.displayWidth ?? source.width ?? source.codedWidth ?? 0;
    const bh = source.displayHeight ?? source.height ?? source.codedHeight ?? 0;
    if (bw && bh) {
      const canvas = document.createElement('canvas');
      canvas.width = bw;
      canvas.height = bh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(bmp as CanvasImageSource, 0, 0, bw, bh);
          const out = await canvasToBlobSafe(canvas);
          if (out) return out;
        } catch {
          /* fall through to raw data */
        }
      }
      try {
        source.close?.();
      } catch {
        /* ignore */
      }
    }
  }

  const data = await maybeAwait(img.data as Uint8Array | Uint8ClampedArray | Promise<Uint8Array | Uint8ClampedArray>);
  if (!data || !width || !height) return null;

  const w = width;
  const h = height;

  // Path 2: raw JPEG/PNG bytes.
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    return new Blob([data.slice()], { type: 'image/jpeg' });
  }

  // Path 3: raw pixel data (RGBA / RGB / grayscale).
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imageData = ctx.createImageData(w, h);
  const px = imageData.data;
  if (data.length === w * h * 4) {
    px.set(data);
  } else if (data.length === w * h * 3) {
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      px[i * 4] = data[j];
      px[i * 4 + 1] = data[j + 1];
      px[i * 4 + 2] = data[j + 2];
      px[i * 4 + 3] = 255;
    }
  } else if (data.length === w * h) {
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = data[i];
      px[i * 4 + 3] = 255;
    }
  } else {
    return null;
  }
  ctx.putImageData(imageData, 0, 0);
  return await canvasToBlobSafe(canvas);
}

async function canvasToBlobSafe(canvas: HTMLCanvasElement): Promise<Blob | null> {
  try {
    return await canvasToBlob(canvas, 'image/png');
  } catch {
    return null;
  }
}

/** Heuristic: outline entries that look like headings (not full paragraphs). */
function looksLikeHeading(title: string): boolean {
  const words = title.split(/\s+/).filter(Boolean).length;
  return (
    title.length <= 80 &&
    words <= 12 &&
    !/[.!?]$/.test(title) &&
    !/^[-–—•*]/.test(title)
  );
}

async function resolveOutline(doc: PdfDoc): Promise<Map<number, string>> {  const map = new Map<number, string>();
  try {
    const outline = await doc.getOutline();
    if (!outline) return map;
    const visit = async (items: unknown[]) => {
      for (const raw of items) {
        const item = raw as { title?: string; dest?: unknown; items?: unknown[] };
        const title = (item.title ?? '').trim();
        if (title && item.dest && looksLikeHeading(title)) {
          const pageIndex = await resolveDestPage(doc, item.dest);
          if (pageIndex != null) {
            const pageNumber = pageIndex + 1;
            if (!map.has(pageNumber)) map.set(pageNumber, title);
          }
        }
        if (Array.isArray(item.items) && item.items.length > 0) {
          await visit(item.items);
        }
      }
    };
    await visit(outline as unknown[]);
  } catch {
    /* ignore */
  }
  return map;
}

async function resolveDestPage(doc: PdfDoc, dest: unknown): Promise<number | null> {
  try {
    let explicit = dest;
    if (typeof dest === 'string') {
      explicit = await doc.getDestination(dest);
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    if (ref && typeof ref === 'object') {
      return await doc.getPageIndex(ref as never);
    }
    if (typeof ref === 'number') return ref;
  } catch {
    /* ignore */
  }
  return null;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), mime, 0.92);
  });
}

function median(values: number[]): number {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}
