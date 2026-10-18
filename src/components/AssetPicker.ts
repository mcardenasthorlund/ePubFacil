export interface EditorImage {
  fileName: string;
  url: string;
}

export interface EditorAssets {
  /** Blob URL for an existing asset file name (created on demand). */
  getUrl(fileName: string): string | undefined;
  /** Persists a new image and returns its file name + display URL. */
  add(blob: Blob, mime: string): Promise<EditorImage>;
  /** All project images, for the gallery picker. */
  list(): EditorImage[];
}

/**
 * Modal gallery to pick an existing project image or upload a new one.
 * Resolves with the chosen image (already persisted when uploaded) or null.
 */
export function openAssetPicker(assets: EditorAssets): Promise<EditorImage | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4';

    const gallery = assets.list();

    overlay.innerHTML = `
      <div class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-slate-900">Insertar imagen</h3>
          <button id="ap-close" class="text-slate-400 hover:text-slate-600 cursor-pointer">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <label class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#2563EB] text-slate-600 text-sm font-semibold cursor-pointer transition mb-4">
          <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Subir una imagen nueva
          <input id="ap-upload" type="file" accept="image/*" class="hidden" />
        </label>

        <p class="text-xs font-semibold text-slate-500 mb-2">Imágenes del libro (${gallery.length})</p>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-3 overflow-auto pr-1" style="min-height: 120px">
          ${
            gallery.length === 0
              ? `<p class="col-span-full text-sm text-slate-400 py-6 text-center">Aún no hay imágenes en este libro. Sube una o pega/arrastra imágenes en el editor.</p>`
              : gallery
                  .map(
                    (img) => `<button data-file="${img.fileName}" class="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-[#2563EB] transition cursor-pointer bg-slate-50">
                      <img src="${img.url}" alt="${img.fileName}" class="w-full h-full object-cover" />
                      <span class="absolute bottom-0 left-0 right-0 text-[9px] font-mono text-white bg-black/45 px-1 py-0.5 truncate">${img.fileName}</span>
                    </button>`
                  )
                  .join('')
          }
        </div>
      </div>`;

    const finish = (value: EditorImage | null) => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    overlay.querySelector('#ap-close')?.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });

    overlay.querySelectorAll<HTMLElement>('[data-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fileName = btn.getAttribute('data-file');
        const found = gallery.find((g) => g.fileName === fileName);
        finish(found ?? null);
      });
    });

    const upload = overlay.querySelector<HTMLInputElement>('#ap-upload');
    upload?.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      try {
        const created = await assets.add(file, file.type || 'image/png');
        finish(created);
      } catch (err) {
        console.error(err);
        finish(null);
      }
    });

    document.body.appendChild(overlay);
  });
}
