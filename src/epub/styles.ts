/**
 * Stylesheet embedded in the generated EPUB. Kept intentionally simple and
 * reader-friendly, without external font references.
 */
export function epubStylesheet(): string {
  return `@charset "UTF-8";

body {
  margin: 0;
  padding: 0;
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.6;
  color: #111111;
  text-align: justify;
  -epub-hyphens: auto;
  hyphens: auto;
}

h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.25;
  color: #0F172A;
  text-align: left;
  page-break-after: avoid;
  margin: 1.4em 0 0.6em;
}

h1 { font-size: 1.6em; margin-top: 0; }
h2 { font-size: 1.35em; }
h3 { font-size: 1.15em; }

p {
  margin: 0 0 0.8em;
  text-indent: 0;
}

img {
  max-width: 100%;
  height: auto;
}

figure {
  margin: 1em 0;
  text-align: center;
  page-break-inside: avoid;
}

figcaption {
  font-size: 0.85em;
  color: #64748B;
  margin-top: 0.4em;
}

blockquote {
  margin: 1em 1.5em;
  font-style: italic;
  color: #334155;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.95em;
}

th, td {
  border: 1px solid #CBD5E1;
  padding: 0.4em 0.6em;
  text-align: left;
}

pre {
  font-family: "Courier New", monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
  background: #F1F5F9;
  padding: 0.8em;
  border-radius: 4px;
  overflow-wrap: break-word;
}

a { color: #2563EB; }

/* Title page */
.titlepage {
  text-align: center;
  margin-top: 20%;
}

.titlepage h1 {
  font-size: 2em;
  text-align: center;
  border: none;
  margin-bottom: 0.4em;
}

.titlepage .author {
  font-size: 1.1em;
  color: #475569;
  font-style: italic;
}

.titlepage .publisher {
  margin-top: 3em;
  font-size: 0.85em;
  color: #94A3B8;
}

/* Cover page */
.cover-page {
  margin: 0;
  padding: 0;
  text-align: center;
}

.cover-page img {
  max-width: 100%;
  max-height: 100%;
}

/* Kobo compatibility spans */
span.koboSpan { }

/* Editor: image sizing */
img.ef-img-sm { max-width: 33%; height: auto; }
img.ef-img-md { max-width: 66%; height: auto; }
img.ef-img-lg { max-width: 100%; height: auto; }
img.ef-img-full { width: 100%; max-width: 100%; height: auto; }

/* Editor: image alignment */
.ef-align-left { text-align: left; }
.ef-align-center { text-align: center; }
.ef-align-right { text-align: right; }
img.ef-align-left { display: block; margin-left: 0; margin-right: auto; }
img.ef-align-center { display: block; margin-left: auto; margin-right: auto; }
img.ef-align-right { display: block; margin-left: auto; margin-right: 0; }

/* Editor: tables */
table.ef-table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.95em;
}
table.ef-table th,
table.ef-table td {
  border: 1px solid #CBD5E1;
  padding: 0.4em 0.6em;
  text-align: left;
}
table.ef-table th,
table.ef-table tr.ef-table-header td {
  background: #F1F5F9;
  font-weight: 700;
}
`;
}
