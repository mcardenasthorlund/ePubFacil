export interface OpfChapter {
  id: string;
  fileName: string;
  title: string;
}

export interface OpfImage {
  id: string;
  fileName: string;
  mime: string;
}

export interface OpfInput {
  version: 2 | 3;
  identifier: string;
  title: string;
  language: string;
  author: string;
  publisher: string;
  description: string;
  rights: string;
  modified: string;
  chapters: OpfChapter[];
  images: OpfImage[];
  hasCoverImage: boolean;
  coverImageId: string;
  coverImageHref: string;
  coverMime: string;
}

function esc(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildOpf(input: OpfInput): string {
  const meta: string[] = [];
  meta.push(`<dc:identifier id="bookid">${esc(input.identifier)}</dc:identifier>`);
  meta.push(`<dc:title>${esc(input.title)}</dc:title>`);
  meta.push(`<dc:language>${esc(input.language || 'es')}</dc:language>`);
  if (input.author) meta.push(`<dc:creator id="creator">${esc(input.author)}</dc:creator>`);
  if (input.publisher) meta.push(`<dc:publisher>${esc(input.publisher)}</dc:publisher>`);
  if (input.description) meta.push(`<dc:description>${esc(input.description)}</dc:description>`);
  if (input.rights) meta.push(`<dc:rights>${esc(input.rights)}</dc:rights>`);
  meta.push(`<meta property="dcterms:modified">${esc(input.modified)}</meta>`);
  if (input.version === 2 && input.hasCoverImage) {
    meta.push(`<meta name="cover" content="${input.coverImageId}"/>`);
  }

  const manifest: string[] = [];
  manifest.push(`<item id="css" href="css/style.css" media-type="text/css"/>`);
  manifest.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);
  if (input.version === 3) {
    manifest.push(
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
    );
  }
  manifest.push(`<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>`);
  if (input.hasCoverImage) {
    manifest.push(`<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    manifest.push(
      `<item id="${input.coverImageId}" href="${input.coverImageHref}" media-type="${esc(
        input.coverMime
      )}" properties="cover-image"/>`
    );
  }
  for (const chapter of input.chapters) {
    manifest.push(
      `<item id="${chapter.id}" href="${chapter.fileName}" media-type="application/xhtml+xml"/>`
    );
  }
  for (const image of input.images) {
    manifest.push(
      `<item id="${image.id}" href="images/${image.fileName}" media-type="${esc(image.mime)}"/>`
    );
  }

  const spine: string[] = [];
  if (input.hasCoverImage) spine.push(`<itemref idref="cover-page" linear="no"/>`);
  spine.push(`<itemref idref="titlepage"/>`);
  spine.push(`<itemref idref="nav" linear="no"/>`);
  for (const chapter of input.chapters) {
    spine.push(`<itemref idref="${chapter.id}"/>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${input.version === 3 ? '3.0' : '2.0'}" unique-identifier="bookid" xml:lang="${esc(
    input.language || 'es'
  )}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    ${meta.join('\n    ')}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
</package>
`;
}
