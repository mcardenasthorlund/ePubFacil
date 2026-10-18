export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Optimizes an image blob, resizing it when it exceeds `maxDimension`.
 * PNG sources keep their transparency; everything else becomes JPEG.
 */
export function optimizeImageBlob(blob: Blob, maxDimension = 1600, quality = 0.85): Promise<OptimizedImage> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        resolve({ blob, width, height });
        return;
      }
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ blob, width: img.naturalWidth, height: img.naturalHeight });
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const keepPng = /png/i.test(blob.type);
      if (!keepPng) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (out) => resolve({ blob: out ?? blob, width, height }),
        keepPng ? 'image/png' : 'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob, width: 0, height: 0 });
    };
    img.src = url;
  });
}
