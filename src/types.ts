export type AppView = 'library' | 'convert' | 'chapters' | 'meta' | 'export' | 'preview';

export interface FolderRecord {
  id?: number;
  name: string;
  parentId?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type SourceKind = 'pdf' | 'docx' | 'odt' | 'html' | 'txt' | 'md';
export type ImportMode = 'reflow' | 'image';

export interface ProjectRecord {
  id?: number;
  title: string;
  author: string;
  description: string;
  language: string;
  publisher: string;
  series: string;
  isbn: string;
  rights: string;
  primaryColor: string;
  brandName: string;
  /** Original input file name. */
  sourceName: string;
  sourceKind: SourceKind;
  importMode: ImportMode;
  chapterCount: number;
  wordCount: number;
  folderId?: number | null;
  coverBlob?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterRecord {
  id?: number;
  projectId: number;
  order: number;
  title: string;
  /** Sanitized HTML fragment for the chapter body (no external refs). */
  html: string;
  include: boolean;
}

export interface AssetRecord {
  id?: number;
  projectId: number;
  /** File name inside the EPUB OEBPS/images directory, e.g. img-001.jpg */
  fileName: string;
  mime: string;
  blob: Blob;
  width?: number;
  height?: number;
}

export interface ExtractedImage {
  /** Original reference found in the source document (data URL key, src, etc.). */
  ref: string;
  blob: Blob;
  width?: number;
  height?: number;
}

export interface ExtractedChapter {
  title: string;
  html: string;
  /** Heading level that started this chapter (1-3), 1 when unknown. */
  level: number;
}

export interface ExtractionResult {
  title: string;
  author: string;
  chapters: ExtractedChapter[];
  images: ExtractedImage[];
  wordCount: number;
  /** Diagnostic messages surfaced to the user (unsupported bits, OCR, etc.). */
  warnings: string[];
}

export interface ConversionProgress {
  percent: number;
  status: string;
}

export interface BatchItem {
  id: string;
  fileName: string;
  kind: SourceKind;
  status: 'pending' | 'working' | 'done' | 'error';
  message?: string;
  projectId?: number;
}

export interface EpubManifestOptions {
  version: 2 | 3;
  kepub: boolean;
}
