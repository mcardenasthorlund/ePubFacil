export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Triggers a browser download for a Blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Shares a Blob using the Web Share API (files) when available, otherwise
 * falls back to a regular download.
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  fileName: string,
  mime: string,
  shareTitle: string,
  shareText: string
): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: mime });
  const nav = navigator as Navigator & {
    share?: (data: unknown) => Promise<void>;
    canShare?: (data: unknown) => boolean;
  };

  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle, text: shareText });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }

  downloadBlob(blob, fileName);
  return 'downloaded';
}

export function safeFileName(title: string, fallback = 'libro'): string {
  const slug = (title || fallback)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}
