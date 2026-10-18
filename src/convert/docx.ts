import * as mammoth from 'mammoth';
import type { ExtractionResult } from '../types';
import { ImageRegistry } from './images';
import { sanitizeHtml, splitIntoChapters, countWords, firstH1 } from './toChapters';

interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

/**
 * Converts a .docx document using mammoth (semantic HTML), capturing embedded
 * images and mapping heading styles to chapters.
 */
export async function convertDocx(fileName: string, arrayBuffer: ArrayBuffer): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const registry = new ImageRegistry();

  const mammothAny = mammoth as unknown as {
    convertToHtml: (
      input: { arrayBuffer: ArrayBuffer },
      options: { convertImage: unknown; styleMap?: string[] }
    ) => Promise<MammothResult>;
    images: { imgElement: (fn: (image: { read: (enc: string) => Promise<string>; contentType: string }) => Promise<{ src: string }>) => unknown };
  };

  const convertImage = mammothAny.images.imgElement((image) =>
    image.read('base64').then((data) => ({
      src: `data:${image.contentType};base64,${data}`,
    }))
  );

  let result: MammothResult;
  try {
    result = await mammothAny.convertToHtml(
      { arrayBuffer },
      {
        convertImage,
        styleMap: [
          "p[style-name='Título'] => h1:fresh",
          "p[style-name='Título 1'] => h1:fresh",
          "p[style-name='Título 2'] => h2:fresh",
          "p[style-name='Subtítulo'] => h2:fresh",
        ],
      }
    );
  } catch (err) {
    throw new Error(`No se pudo leer el documento Word: ${(err as Error).message}`);
  }

  for (const msg of result.messages || []) {
    if (msg.type === 'warning' || msg.type === 'error') {
      warnings.push(msg.message);
    }
  }

  let sanitized = sanitizeHtml(result.value);
  sanitized = registry.rewriteDataUrls(sanitized);

  const fallbackTitle = fileName || 'Documento';
  const finalTitle = firstH1(sanitized) || fallbackTitle;
  const chapters = splitIntoChapters(sanitized, finalTitle);

  return {
    title: finalTitle,
    author: '',
    chapters,
    images: registry.images,
    wordCount: chapters.reduce((sum, c) => sum + countWords(c.html), 0),
    warnings,
  };
}
