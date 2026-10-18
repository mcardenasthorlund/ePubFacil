export interface GenerateCoverOptions {
  title: string;
  author?: string;
  brandName?: string;
  primaryColor: string;
  width?: number;
  height?: number;
}

export interface GeneratedCover {
  blob: Blob;
  width: number;
  height: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function shade(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const amt = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Generates a PNG cover (title + author) using an offscreen canvas, following
 * the ePubFacil visual identity.
 */
export function generateCoverBlob(opts: GenerateCoverOptions): Promise<GeneratedCover> {
  const width = opts.width || 1200;
  const height = opts.height || 1600;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas no disponible'));
      return;
    }

    const base = opts.primaryColor || '#2563EB';
    const lighter = shade(base, 18);
    const darker = shade(base, -24);

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, lighter);
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, darker);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative frame with a small book accent.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 4;
    const margin = Math.round(width * 0.08);
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    // Brand name at top.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `700 ${Math.round(width * 0.03)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText((opts.brandName || 'EPUBFACIL').toUpperCase(), width / 2, height * 0.15);

    // Title (wrapped, centered).
    ctx.fillStyle = '#FFFFFF';
    const titleSize = Math.round(width * 0.082);
    ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
    const titleLines = wrapText(ctx, opts.title || 'Sin título', width * 0.78);
    const lineHeight = titleSize * 1.22;
    let currentY = height * 0.42 - ((titleLines.length - 1) * lineHeight) / 2;
    for (const line of titleLines) {
      ctx.fillText(line, width / 2, currentY);
      currentY += lineHeight;
    }

    // Divider.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const dividerW = Math.round(width * 0.18);
    ctx.fillRect(width / 2 - dividerW / 2, currentY + lineHeight * 0.4, dividerW, Math.max(3, width * 0.006));

    // Author.
    if (opts.author) {
      ctx.font = `500 ${Math.round(width * 0.045)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(opts.author, width / 2, currentY + lineHeight * 1.6);
    }

    // Footer.
    ctx.font = `${Math.round(width * 0.026)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('GENERADO CON EPUBFACIL', width / 2, height - height * 0.07);

    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('No se pudo generar la carátula'))),
      'image/png'
    );
  });
}

/** Resizes a user-provided cover image to fit within max dimensions. */
export function resizeCoverBlob(blob: Blob, maxWidth = 1400, maxHeight = 2100): Promise<Blob> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxWidth && height <= maxHeight) {
        resolve(blob);
        return;
      }
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((out) => resolve(out ?? blob), 'image/jpeg', 0.92);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
