import JSZip from 'jszip';
import { buildOpf, type OpfChapter, type OpfImage } from './opf';
import { buildNav, buildNcx } from './ncx';
import { epubStylesheet } from './styles';

export interface EpubChapterInput {
  title: string;
  html: string;
}

export interface EpubAssetInput {
  fileName: string;
  mime: string;
  blob: Blob;
}

export interface EpubBuildInput {
  title: string;
  author: string;
  language: string;
  publisher: string;
  description: string;
  rights: string;
  isbn: string;
  version: 2 | 3;
  kepub: boolean;
  chapters: EpubChapterInput[];
  assets: EpubAssetInput[];
  coverBlob?: Blob | null;
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

function esc(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeChildren(root: Element): string {
  const serializer = new XMLSerializer();
  return Array.from(root.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');
}

/** Converts an HTML fragment into a well-formed XHTML fragment. */
function toXhtmlFragment(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return serializeChildren(doc.body);
}

/** Wraps sentences in <span class="koboSpan"> for Kobo compatibility. */
function wrapKoboSpans(html: string, chapterIndex: number): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  let counter = 0;
  for (const node of nodes) {
    const parent = node.parentNode as Element | null;
    if (!parent || /^(script|style)$/i.test(parent.nodeName)) continue;
    const sentences = (node.textContent ?? '').split(/(?<=[.!?…])\s+/);
    if (sentences.length <= 1) continue;
    const frag = doc.createDocumentFragment();
    for (const sentence of sentences) {
      if (!sentence.trim()) {
        frag.appendChild(doc.createTextNode(sentence));
        continue;
      }
      counter++;
      const span = doc.createElementNS(XHTML_NS, 'span');
      span.setAttribute('class', 'koboSpan');
      span.setAttribute('id', `kobo.${chapterIndex}.${counter}`);
      span.textContent = sentence;
      frag.appendChild(span);
    }
    parent.replaceChild(frag, node);
  }

  return serializeChildren(doc.body);
}

function xhtmlPage(language: string, title: string, bodyInner: string, cssHref: string, extraHead = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(
    language
  )}" lang="${esc(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${esc(title)}</title>
    <link rel="stylesheet" type="text/css" href="${cssHref}"/>
    ${extraHead}
  </head>
  <body>
${bodyInner}
  </body>
</html>
`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extFromMime(mime: string): string {
  if (/png/i.test(mime)) return 'png';
  if (/gif/i.test(mime)) return 'gif';
  if (/svg/i.test(mime)) return 'svg';
  if (/webp/i.test(mime)) return 'webp';
  return 'jpg';
}

function measure(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 1600 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 1200, height: 1600 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function buildEpub(input: EpubBuildInput): Promise<Blob> {
  const zip = new JSZip();
  const language = input.language || 'es';

  // 1. mimetype (must be first and uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. Container
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
  );

  // 3. Chapters
  const chapters: OpfChapter[] = input.chapters.map((c, i) => ({
    id: `chap-${String(i + 1).padStart(4, '0')}`,
    fileName: `text/chapter-${String(i + 1).padStart(4, '0')}.xhtml`,
    title: c.title || `Capítulo ${i + 1}`,
  }));

  for (let i = 0; i < input.chapters.length; i++) {
    let fragment = toXhtmlFragment(input.chapters[i].html);
    // Chapters live in OEBPS/text/, so asset and stylesheet references must be
    // relative to that folder.
    fragment = fragment.replace(/src=("|')images\//gi, 'src=$1../images/');
    if (input.kepub) {
      fragment = wrapKoboSpans(fragment, i + 1);
    }
    const page = xhtmlPage(
      language,
      chapters[i].title,
      `    <div class="chapter">\n${fragment}\n    </div>`,
      '../css/style.css'
    );
    zip.file(`OEBPS/${chapters[i].fileName}`, page);
  }

  // 4. Images
  const images: OpfImage[] = [];
  input.assets.forEach((asset, i) => {
    zip.file(`OEBPS/images/${asset.fileName}`, asset.blob);
    images.push({ id: `img-${String(i + 1).padStart(4, '0')}`, fileName: asset.fileName, mime: asset.mime });
  });

  // 5. Cover
  let coverImageId = '';
  let coverImageHref = '';
  let coverMime = 'image/jpeg';
  if (input.coverBlob) {
    const ext = extFromMime(input.coverBlob.type || 'image/jpeg');
    coverMime = input.coverBlob.type || 'image/jpeg';
    const coverFileName = `cover.${ext}`;
    coverImageHref = `images/${coverFileName}`;
    coverImageId = 'cover-image';
    zip.file(`OEBPS/images/${coverFileName}`, input.coverBlob);

    const { width, height } = await measure(input.coverBlob);
    const coverBody = `    <div class="cover-page">
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <image width="${width}" height="${height}" xlink:href="images/${coverFileName}"/>
      </svg>
    </div>`;
    zip.file('OEBPS/cover.xhtml', xhtmlPage(language, input.title, coverBody, 'css/style.css'));
  }

  // 6. Title page
  const titleBody = `    <div class="titlepage">
      <h1>${esc(input.title)}</h1>
      ${input.author ? `<p class="author">${esc(input.author)}</p>` : ''}
      ${input.publisher ? `<p class="publisher">${esc(input.publisher)}</p>` : ''}
    </div>`;
  zip.file('OEBPS/title.xhtml', xhtmlPage(language, input.title, titleBody, 'css/style.css'));

  // 7. Nav (EPUB3)
  if (input.version === 3) {
    zip.file('OEBPS/nav.xhtml', buildNav(language, input.title, chapters));
  }

  // 8. NCX
  const identifier = input.isbn
    ? `urn:isbn:${input.isbn.replace(/[^0-9Xx]/g, '')}`
    : `urn:uuid:${uuid()}`;
  zip.file('OEBPS/toc.ncx', buildNcx(identifier, input.title, input.author, chapters));

  // 9. OPF
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    buildOpf({
      version: input.version,
      identifier,
      title: input.title,
      language,
      author: input.author,
      publisher: input.publisher,
      description: input.description,
      rights: input.rights,
      modified,
      chapters,
      images,
      hasCoverImage: !!input.coverBlob,
      coverImageId,
      coverImageHref,
      coverMime,
    })
  );

  // 10. Stylesheet
  zip.file('OEBPS/css/style.css', epubStylesheet());

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
