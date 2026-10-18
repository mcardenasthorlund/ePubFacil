/**
 * OCR support via tesseract.js. Loaded lazily (dynamic import) so the large
 * OCR engine is only pulled in when actually needed. Language data is fetched
 * on first use, so the very first OCR run requires a network connection.
 */
let workerPromise: Promise<unknown> | null = null;
let workerLang = '';
let activeLang = 'spa';

interface TesseractWorker {
  recognize: (input: unknown) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}

async function getWorker(
  lang: string,
  onProgress?: (percent: number, status: string) => void
): Promise<TesseractWorker> {
  if (workerPromise && workerLang === lang) {
    return workerPromise as Promise<TesseractWorker>;
  }
  if (workerPromise) {
    try {
      const old = (await workerPromise) as TesseractWorker;
      await old.terminate();
    } catch {
      /* ignore */
    }
    workerPromise = null;
  }

  workerLang = lang;
  workerPromise = (async () => {
    const tesseract = await import('tesseract.js');
    const worker = await tesseract.createWorker(lang, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (onProgress && m.status) {
          onProgress(Math.round((m.progress || 0) * 100), m.status);
        }
      },
    });
    return worker as unknown as TesseractWorker;
  })();

  return workerPromise as Promise<TesseractWorker>;
}

export async function recognizeImage(
  input: Blob | HTMLCanvasElement,
  lang: string,
  onProgress?: (percent: number, status: string) => void
): Promise<string> {
  activeLang = lang || 'spa';
  const worker = await getWorker(activeLang, onProgress);
  const result = await worker.recognize(input);
  return (result.data.text || '').trim();
}

export function getActiveOcrLang(): string {
  return activeLang;
}

export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    try {
      const w = (await workerPromise) as TesseractWorker;
      await w.terminate();
    } catch {
      /* ignore */
    }
    workerPromise = null;
  }
}
