import type { OpfChapter } from './opf';

function esc(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildNcx(
  identifier: string,
  title: string,
  author: string,
  chapters: OpfChapter[]
): string {
  const points = chapters
    .map(
      (c, i) => `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(c.title)}</text></navLabel>
      <content src="${c.fileName}"/>
    </navPoint>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${esc(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <docAuthor><text>${esc(author)}</text></docAuthor>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

export function buildNav(language: string, title: string, chapters: OpfChapter[]): string {
  const items = chapters
    .map((c) => `      <li><a href="${c.fileName}">${esc(c.title)}</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(
    language || 'es'
  )}" lang="${esc(language || 'es')}">
  <head>
    <meta charset="utf-8"/>
    <title>${esc(title)} — Índice</title>
    <link rel="stylesheet" type="text/css" href="css/style.css"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Índice</h1>
      <ol>
${items}
      </ol>
    </nav>
    <nav epub:type="landmarks" id="landmarks" hidden="hidden">
      <h2>Marcadores</h2>
      <ol>
        <li><a epub:type="bodymatter" href="${chapters[0]?.fileName ?? 'title.xhtml'}">Inicio del contenido</a></li>
      </ol>
    </nav>
  </body>
</html>
`;
}
