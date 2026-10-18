import type { SourceKind } from '../types';

const EXT_MAP: Record<string, SourceKind> = {
  pdf: 'pdf',
  docx: 'docx',
  odt: 'odt',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  txt: 'txt',
  text: 'txt',
  md: 'md',
  markdown: 'md',
  mdown: 'md',
};

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : '';
}

export function detectKind(fileName: string): SourceKind | null {
  return EXT_MAP[extensionOf(fileName)] ?? null;
}

export function baseName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  const name = idx >= 0 ? fileName.slice(0, idx) : fileName;
  return name.replace(/[_-]+/g, ' ').trim() || 'Documento';
}

export function kindLabel(kind: SourceKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'Word (.docx)';
    case 'odt':
      return 'OpenDocument (.odt)';
    case 'html':
      return 'HTML';
    case 'txt':
      return 'Texto plano';
    case 'md':
      return 'Markdown';
  }
}

export function isTextLike(kind: SourceKind): boolean {
  return kind === 'txt' || kind === 'md' || kind === 'html';
}
