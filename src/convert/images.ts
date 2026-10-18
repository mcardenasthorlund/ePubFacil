import type { ExtractedImage } from '../types';

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

/**
 * Accumulates extracted images and hands out stable token references that can
 * be embedded as `src` placeholders in the intermediate HTML.
 */
export class ImageRegistry {
  readonly images: ExtractedImage[] = [];

  add(blob: Blob, width?: number, height?: number): string {
    const ref = `efimg-${this.images.length}`;
    this.images.push({ ref, blob, width, height });
    return ref;
  }

  get(ref: string): ExtractedImage | undefined {
    return this.images.find((i) => i.ref === ref);
  }

  /** Replaces every data-URL <img src> with a token, registering the image. */
  rewriteDataUrls(html: string): string {
    return html.replace(/src=("|')(data:image\/[^"']+)\1/gi, (_match, quote: string, dataUrl: string) => {
      const blob = dataUrlToBlob(dataUrl);
      const ref = this.add(blob);
      return `src=${quote}${ref}${quote}`;
    });
  }
}

/** Gets intrinsic dimensions of an image blob via an <img> element. */
export function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const CORE_IMAGE_TYPES: Record<string, { mime: string; ext: string }> = {
  'image/png': { mime: 'image/png', ext: 'png' },
  'image/jpeg': { mime: 'image/jpeg', ext: 'jpg' },
  'image/jpg': { mime: 'image/jpeg', ext: 'jpg' },
  'image/gif': { mime: 'image/gif', ext: 'gif' },
  'image/svg+xml': { mime: 'image/svg+xml', ext: 'svg' },
};

async function loadBitmap(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    /* fall back to an <img> decode below */
  }
  return null;
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Ensures an image uses an EPUB-core format. Supported types pass through;
 * other raster formats (WebP/TIFF/BMP…) are re-encoded to PNG. Returns null when
 * the image cannot be decoded, so callers can drop it instead of shipping a
 * broken reference.
 */
export async function normalizeImageForEpub(
  blob: Blob
): Promise<{ blob: Blob; mime: string; ext: string } | null> {
  const type = (blob.type || '').toLowerCase();
  const core = CORE_IMAGE_TYPES[type];
  if (core) return { blob, mime: core.mime, ext: core.ext };

  const bitmap = await loadBitmap(blob);
  const source: CanvasImageSource | null = bitmap ?? (await loadImageElement(blob));
  if (!source) return null;

  const width = (source as ImageBitmap).width || (source as HTMLImageElement).naturalWidth || 0;
  const height = (source as ImageBitmap).height || (source as HTMLImageElement).naturalHeight || 0;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);

  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!out) return null;
  return { blob: out, mime: 'image/png', ext: 'png' };
}
