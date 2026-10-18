import type { AssetRecord, ConversionProgress, ExtractionResult, ImportMode, SourceKind } from '../types';
import { baseName, detectKind } from './detect';
import { convertHtml } from './html';
import { convertText } from './text';
import { measureImage, normalizeImageForEpub } from './images';
import { stripPageNumberParagraphs } from './clean';

export interface ConvertOptions {
  mode: ImportMode;
  ocr: boolean;
  ocrLang: string;
  onProgress?: (progress: ConversionProgress) => void;
}

export interface ConvertOutput {
  kind: SourceKind;
  result: ExtractionResult;
  assets: Omit<AssetRecord, 'id' | 'projectId'>[];
}

export { detectKind, baseName } from './detect';

export async function convertFile(file: File, options: ConvertOptions): Promise<ConvertOutput> {
  const kind = detectKind(file.name);
  if (!kind) {
    throw new Error(`Formato no soportado: ${file.name}`);
  }
  const title = baseName(file.name);
  const progress = options.onProgress ?? (() => {});
  progress({ percent: 3, status: 'Leyendo el archivo…' });

  let result: ExtractionResult;
  switch (kind) {
    case 'pdf': {
      const buffer = await file.arrayBuffer();
      const { convertPdf } = await import('./pdf');
      result = await convertPdf(file.name, buffer, {
        mode: options.mode,
        ocr: options.ocr,
        ocrLang: options.ocrLang,
        onProgress: (percent, status) => progress({ percent, status }),
      });
      break;
    }
    case 'docx': {
      const buffer = await file.arrayBuffer();
      const { convertDocx } = await import('./docx');
      result = await convertDocx(file.name, buffer);
      break;
    }
    case 'odt': {
      const buffer = await file.arrayBuffer();
      const { convertOdt } = await import('./odt');
      result = await convertOdt(file.name, buffer);
      break;
    }
    case 'html': {
      const content = await file.text();
      result = convertHtml(file.name, content);
      break;
    }
    case 'md': {
      const content = await file.text();
      result = convertText(file.name, content, true);
      break;
    }
    case 'txt': {
      const content = await file.text();
      result = convertText(file.name, content, false);
      break;
    }
  }

  progress({ percent: 92, status: 'Vinculando imágenes y capítulos…' });

  // Safety net for every format: remove paragraphs that are just a page number.
  result.chapters = result.chapters.map((chapter) => ({
    ...chapter,
    html: stripPageNumberParagraphs(chapter.html),
  }));

  const assets = await assignAssets(result);

  if (result.chapters.length === 0) {
    throw new Error('No se pudo extraer contenido del documento.');
  }

  progress({ percent: 100, status: 'Conversión completada' });
  return { kind, result: { ...result, title: result.title || title }, assets };
}

/**
 * Assigns stable EPUB file names to the images actually referenced by the
 * chapters, measures them and rewrites the chapter markup accordingly.
 */
async function assignAssets(result: ExtractionResult): Promise<Omit<AssetRecord, 'id' | 'projectId'>[]> {
  const allHtml = result.chapters.map((c) => c.html).join('\n');
  const refToFile = new Map<string, string>();
  const assets: Omit<AssetRecord, 'id' | 'projectId'>[] = [];

  let counter = 1;
  for (const image of result.images) {
    const referenced = allHtml.includes(`"${image.ref}"`) || allHtml.includes(`'${image.ref}'`);
    if (!referenced) continue;

    const normalized = await normalizeImageForEpub(image.blob);
    if (!normalized) continue;

    const fileName = `img-${String(counter).padStart(3, '0')}.${normalized.ext}`;
    refToFile.set(image.ref, fileName);

    let width = image.width ?? 0;
    let height = image.height ?? 0;
    if (!width || !height) {
      const dims = await measureImage(normalized.blob);
      width = dims.width;
      height = dims.height;
    }

    assets.push({
      fileName,
      mime: normalized.mime,
      blob: normalized.blob,
      width,
      height,
    });
    counter++;
  }

  if (refToFile.size > 0) {
    result.chapters = result.chapters.map((chapter) => ({
      ...chapter,
      html: chapter.html
        // Guarantee images scale to the reader width regardless of its CSS.
        .replace(/<img (?![^>]*\bstyle=)/gi, '<img style="max-width:100%;height:auto;" ')
        .replace(/src=("|')(efimg-\d+)\1/g, (match, quote: string, ref: string) => {
          const fileName = refToFile.get(ref);
          return fileName ? `src=${quote}images/${fileName}${quote}` : match;
        }),
    }));
  }

  return assets;
}
