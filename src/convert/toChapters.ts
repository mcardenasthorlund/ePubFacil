import type { ExtractedChapter } from '../types';

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'blockquote',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'pre',
  'code',
  'hr',
  'a',
  'span',
  'div',
  'section',
]);

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'id']);

/** Class names the editor may attach, kept whitelisted for safety. */
const ALLOWED_CLASSES = new Set([
  'ef-img-sm',
  'ef-img-md',
  'ef-img-lg',
  'ef-img-full',
  'ef-align-left',
  'ef-align-center',
  'ef-align-right',
  'ef-table',
  'ef-table-header',
]);

/**
 * Removes scripts, styles, event handlers and unsupported tags from an HTML
 * fragment, keeping only a safe whitelist. External <a href> links are kept.
 */
export function sanitizeHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(`<body>${rawHtml}</body>`, 'text/html');

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'iframe') {
          el.remove();
          continue;
        }

        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap unknown elements, preserving their children (e.g. <font>, <o:p>).
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el);
          }
          el.remove();
          continue;
        }

        // Drop images that only point at remote resources (offline policy).
        if (tag === 'img') {
          const src = el.getAttribute('src')?.trim() ?? '';
          if (!/^(data:|images\/|blob:|efimg-)/i.test(src)) {
            el.remove();
            continue;
          }
        }

        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name === 'class') {
            const kept = attr.value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c));
            if (kept.length > 0) el.setAttribute('class', kept.join(' '));
            else el.removeAttribute('class');
            continue;
          }
          if (!ALLOWED_ATTRS.has(name)) {
            el.removeAttribute(attr.name);
          }
        }

        walk(el);
      }
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
}

/**
 * Picks the heading level used to split chapters. Prefers the shallowest level
 * that produces at least two sections, which handles the common case of a
 * single document title (H1) followed by chapters (H2).
 */
function pickSplitLevel(nodes: Node[]): number {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const m = /^h([1-4])$/.exec((node as HTMLElement).tagName.toLowerCase());
      if (m) counts[Number(m[1])] += 1;
    }
  }
  for (const level of [1, 2, 3, 4]) {
    if (counts[level] >= 2) return level;
  }
  for (const level of [1, 2, 3, 4]) {
    if (counts[level] >= 1) return level;
  }
  return 99;
}

/** Returns the text of the first <h1> in an HTML fragment, if any. */
export function firstH1(html: string): string | null {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const h1 = doc.querySelector('h1');
  const text = h1?.textContent?.trim();
  return text || null;
}

/**
 * Splits a sanitized HTML body into chapters using the shallowest heading level
 * available. Content before the first heading becomes an introductory chapter.
 *
 * @param bodyHtml sanitized body HTML
 * @param imageResolver maps an <img src> reference to its EPUB file name
 */
export function splitIntoChapters(
  bodyHtml: string,
  fallbackTitle: string,
  imageResolver?: (ref: string) => string | null
): ExtractedChapter[] {
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
  const body = doc.body;

  const nodes = Array.from(body.childNodes);
  const effectiveLevel = pickSplitLevel(nodes);
  const hasHeadings = effectiveLevel !== 99;

  // When splitting below H1 and there is exactly one H1, treat it as the title
  // rather than as chapter content.
  let titleOnlyH1: string | null = null;
  if (hasHeadings && effectiveLevel > 1) {
    const h1s = nodes.filter(
      (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'h1'
    );
    if (h1s.length === 1) titleOnlyH1 = (h1s[0] as HTMLElement).textContent?.trim() || null;
  }

  const chapters: ExtractedChapter[] = [];
  let currentTitle = hasHeadings ? '' : fallbackTitle;
  let currentLevel = 1;
  let buffer: string[] = [];

  const flush = () => {
    const html = buffer.join('').trim();
    if (html || currentTitle) {
      chapters.push({
        title: currentTitle || fallbackTitle || `Capítulo ${chapters.length + 1}`,
        html: html || '<p></p>',
        level: currentLevel,
      });
    }
    buffer = [];
  };

  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const m = /^h([1-4])$/.exec(tag);
      if (m && Number(m[1]) === effectiveLevel) {
        const headingText = el.textContent?.trim() || `Capítulo ${chapters.length + 1}`;
        // Collapse consecutive headings with the same text (common when a PDF
        // renders a chapter title both as an image and as selectable text).
        if (headingText === currentTitle) continue;
        flush();
        currentTitle = headingText;
        currentLevel = Number(m[1]);
        continue;
      }
      if (titleOnlyH1 && tag === 'h1' && (el.textContent?.trim() || null) === titleOnlyH1) {
        continue;
      }
    }
    buffer.push(serializeNode(node, imageResolver));
  }
  flush();

  if (chapters.length === 0) {
    chapters.push({ title: fallbackTitle || 'Contenido', html: '<p></p>', level: 1 });
  }

  // Drop chapters without any text or image content (e.g. outline entries that
  // produced an empty section).
  const pruned = chapters.filter(
    (c) => c.html.replace(/<[^>]*>/g, '').trim() !== '' || /<(img|figure|table)\b/i.test(c.html)
  );
  const result = pruned.length > 0 ? pruned : chapters;

  // Drop a leading empty intro chapter if it only contains whitespace.
  if (result.length > 1 && /^\s*$/.test(result[0].html.replace(/<[^>]+>/g, ''))) {
    result.shift();
  }

  return result;
}

function serializeNode(node: Node, imageResolver?: (ref: string) => string | null): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const clone = el.cloneNode(true) as HTMLElement;

  if (imageResolver) {
    clone.querySelectorAll('img').forEach((img) => {
      const ref = img.getAttribute('src') ?? '';
      const fileName = imageResolver(ref);
      if (fileName) {
        img.setAttribute('src', `images/${fileName}`);
      } else {
        img.remove();
      }
    });
    if (clone.tagName.toLowerCase() === 'img') {
      const ref = clone.getAttribute('src') ?? '';
      const fileName = imageResolver(ref);
      if (fileName) clone.setAttribute('src', `images/${fileName}`);
      else return '';
    }
  }

  return clone.outerHTML;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}
