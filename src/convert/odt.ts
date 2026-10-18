import JSZip from 'jszip';
import type { ExtractionResult } from '../types';
import { ImageRegistry } from './images';
import { splitIntoChapters, countWords, sanitizeHtml, firstH1 } from './toChapters';

const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const META_NS = 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0';

function localName(el: Element): string {
  return el.localName.toLowerCase();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getXlinkHref(el: Element): string {
  return el.getAttributeNS(XLINK_NS, 'href') ?? el.getAttribute('xlink:href') ?? '';
}

function outlineLevel(el: Element): number {
  const attr = el.getAttributeNS(TEXT_NS, 'outline-level') ?? el.getAttribute('text:outline-level');
  if (attr) {
    const n = parseInt(attr, 10);
    if (!isNaN(n)) return Math.min(Math.max(n, 1), 3);
  }
  const style = el.getAttributeNS(TEXT_NS, 'style-name') ?? el.getAttribute('text:style-name') ?? '';
  const m = /(?:Heading|Titulo|Título)[_\s-]?(\d)/i.exec(style);
  if (m) return Math.min(Math.max(parseInt(m[1], 10), 1), 3);
  return 1;
}

/** Builds inline HTML from a container (text:p, text:h, text:span, ...). */
function inlineHtml(node: Element, imageMap: Map<string, string>): string {
  let html = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      html += escapeHtml(child.textContent ?? '');
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const name = localName(el);

    if (name === 's') {
      const count = parseInt(val(el, 'c') || '1', 10);
      html += '&nbsp;'.repeat(Math.max(1, Math.min(count, 20)));
      return;
    }
    if (name === 'tab') {
      html += '\t';
      return;
    }
    if (name === 'line-break') {
      html += '<br>';
      return;
    }
    if (name === 'span') {
      const inner = inlineHtml(el, imageMap);
      const style = (el.getAttributeNS(TEXT_NS, 'style-name') ?? el.getAttribute('text:style-name') ?? '').toLowerCase();
      if (/bold|strong/.test(style)) html += `<strong>${inner}</strong>`;
      else if (/italic|emphasis/.test(style)) html += `<em>${inner}</em>`;
      else if (/underline/.test(style)) html += `<u>${inner}</u>`;
      else html += inner;
      return;
    }
    if (name === 'a') {
      const href = getXlinkHref(el);
      const inner = inlineHtml(el, imageMap);
      html += href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
      return;
    }
    if (name === 'image') {
      const href = getXlinkHref(el);
      const ref = imageMap.get(href) ?? imageMap.get(decodeURIComponent(href));
      if (ref) html += `<img src="${ref}" alt="">`;
      return;
    }
    // Fallback: flatten unknown inline elements.
    html += inlineHtml(el, imageMap);
  });
  return html;
}

function val(el: Element, name: string): string | null {
  return el.getAttributeNS(TEXT_NS, name) ?? el.getAttribute(`text:${name}`) ?? el.getAttribute(name);
}

/** Recursively converts block-level ODT content to HTML. */
function blockHtml(node: Element, imageMap: Map<string, string>): string {
  let html = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const name = localName(el);

    switch (name) {
      case 'h': {
        const level = outlineLevel(el);
        html += `<h${level}>${inlineHtml(el, imageMap)}</h${level}>`;
        break;
      }
      case 'p': {
        const inner = inlineHtml(el, imageMap);
        html += `<p>${inner || '&nbsp;'}</p>`;
        break;
      }
      case 'list': {
        const style = (el.getAttributeNS(TEXT_NS, 'style-name') ?? '').toLowerCase();
        const ordered = /number|numeric/.test(style);
        const tag = ordered ? 'ol' : 'ul';
        let items = '';
        el.childNodes.forEach((li) => {
          if (li.nodeType === Node.ELEMENT_NODE && localName(li as Element) === 'list-item') {
            let inner = '';
            (li as Element).childNodes.forEach((c) => {
              if (c.nodeType === Node.ELEMENT_NODE) {
                const ce = c as Element;
                const cn = localName(ce);
                if (cn === 'h') inner += `<h${outlineLevel(ce)}>${inlineHtml(ce, imageMap)}</h${outlineLevel(ce)}>`;
                else if (cn === 'p') inner += inlineHtml(ce, imageMap);
                else if (cn === 'list') inner += blockHtml(li as Element, imageMap);
              }
            });
            items += `<li>${inner}</li>`;
          }
        });
        html += `<${tag}>${items}</${tag}>`;
        break;
      }
      case 'table': {
        html += tableHtml(el, imageMap);
        break;
      }
      case 'section':
      case 'frame':
      case 'text-box': {
        html += blockHtml(el, imageMap);
        break;
      }
      default:
        break;
    }
  });
  return html;
}

function tableHtml(table: Element, imageMap: Map<string, string>): string {
  let rows = '';
  const rowEls = table.getElementsByTagName('table:table-row');
  for (let r = 0; r < rowEls.length; r++) {
    const row = rowEls[r];
    let cells = '';
    const cellEls = row.getElementsByTagName('table:table-cell');
    for (let c = 0; c < cellEls.length; c++) {
      cells += `<td>${blockHtml(cellEls[c], imageMap)}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return rows ? `<table><tbody>${rows}</tbody></table>` : '';
}

export async function convertOdt(fileName: string, arrayBuffer: ArrayBuffer): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const registry = new ImageRegistry();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const contentFile = zip.file('content.xml');
  if (!contentFile) {
    throw new Error('El archivo .odt no contiene content.xml');
  }
  const contentXml = await contentFile.async('string');
  const parseXml = (xml: string, mime: DOMParserSupportedType) =>
    new DOMParser().parseFromString(xml, mime);

  const contentDoc = parseXml(contentXml, 'application/xml');

  // Metadata (best effort).
  let title = '';
  let author = '';
  const metaFile = zip.file('meta.xml');
  if (metaFile) {
    const metaDoc = parseXml(await metaFile.async('string'), 'application/xml');
    title = metaDoc.getElementsByTagNameNS(DC_NS, 'title')[0]?.textContent?.trim() ?? '';
    author =
      metaDoc.getElementsByTagNameNS(DC_NS, 'creator')[0]?.textContent?.trim() ??
      metaDoc.getElementsByTagNameNS(META_NS, 'initial-creator')[0]?.textContent?.trim() ??
      '';
  }

  // Load images referenced by draw:image.
  const imageMap = new Map<string, string>();
  const imageEls = contentDoc.getElementsByTagName('draw:image');
  for (let i = 0; i < imageEls.length; i++) {
    const href = getXlinkHref(imageEls[i]);
    if (!href || imageMap.has(href)) continue;
    const file = zip.file(href) ?? zip.file(decodeURIComponent(href));
    if (!file) continue;
    const blob = await file.async('blob');
    const ref = registry.add(blob);
    imageMap.set(href, ref);
  }

  const bodies = contentDoc.getElementsByTagName('office:text');
  const body = bodies[0] ?? contentDoc.documentElement;
  let html = blockHtml(body, imageMap);
  html = sanitizeHtml(html);

  const fallbackTitle = title || fileName || 'Documento';
  const finalTitle = title || firstH1(html) || fallbackTitle;
  const chapters = splitIntoChapters(html, finalTitle);

  if (chapters.length === 0) {
    warnings.push('No se encontró contenido de texto en el documento .odt.');
  }

  return {
    title: finalTitle,
    author,
    chapters,
    images: registry.images,
    wordCount: chapters.reduce((sum, c) => sum + countWords(c.html), 0),
    warnings,
  };
}
