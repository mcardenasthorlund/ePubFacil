import { showToast } from '../components/Toast';
import {
  createProject,
  replaceProjectAssets,
  replaceProjectChapters,
} from '../db/db';
import { convertFile } from '../convert';
import { baseName, detectKind, kindLabel } from '../convert/detect';
import { getActiveOcrLang } from '../convert/ocr';
import type { AssetRecord, BatchItem, ImportMode, ProjectRecord, SourceKind } from '../types';
import { SUPPORTED_EXTENSIONS } from '../version';

export interface ConvertCallbacks {
  onConverted: (projectId: number | null) => void;
  onCancel: () => void;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ACCEPT = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export class ConvertView {
  private container: HTMLElement;
  private callbacks: ConvertCallbacks;
  private folderId: number | null;

  private files: File[] = [];
  private mode: ImportMode = 'reflow';
  private ocr = true;
  private ocrLang = 'spa';
  private batchMode: 'queue' | 'merge' = 'merge';
  private busy = false;
  private statusText = '';
  private percent = 0;
  private queue: BatchItem[] = [];

  constructor(callbacks: ConvertCallbacks, folderId: number | null = null) {
    this.callbacks = callbacks;
    this.folderId = folderId;
    this.container = document.createElement('div');
    this.container.className = 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  load() {
    this.render();
  }

  private render() {
    const hasFiles = this.files.length > 0;
    const hasPdf = this.files.some((f) => detectKind(f.name) === 'pdf');
    const isBatch = this.files.length > 1;

    this.container.innerHTML = `
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">Convertir documento en ePub</h1>
          <p class="mt-1 text-sm text-slate-500">Añade uno o varios archivos. La conversión ocurre en tu dispositivo.</p>
        </div>
        <button id="cv-cancel" class="text-sm font-medium px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer">Volver</button>
      </div>

      <div id="cv-dropzone" class="bg-white rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#2563EB] transition-colors p-8 sm:p-12 text-center cursor-pointer">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mb-4">
          <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </div>
        <p class="text-base font-semibold text-slate-800">Arrastra tus archivos aquí o haz clic para elegirlos</p>
        <p class="mt-1 text-xs text-slate-500">Formatos: PDF, DOCX (Word), ODT (OpenOffice), HTML, TXT y Markdown</p>
        <input id="cv-file-input" type="file" multiple accept="${ACCEPT}" class="hidden" />
      </div>

      ${
        hasFiles
          ? `<div class="mt-6 bg-white rounded-xl border border-slate-200 shadow-xs p-4">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-bold text-slate-800">Archivos seleccionados (${this.files.length})</h2>
                <button id="cv-clear" class="text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer">Quitar todos</button>
              </div>
              <ul class="flex flex-col gap-2">
                ${this.files
                  .map((f, i) => {
                    const kind = detectKind(f.name);
                    return `<li class="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span class="w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(f.name)}</p>
                        <p class="text-[11px] text-slate-400">${kind ? kindLabel(kind) : 'No compatible'} · ${(f.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button data-remove="${i}" class="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </li>`;
                  })
                  .join('')}
              </ul>
            </div>

            ${
              isBatch
                ? `<div class="mt-4 bg-white rounded-xl border border-slate-200 shadow-xs p-4">
                    <h2 class="text-sm font-bold text-slate-800 mb-3">Modo por lotes</h2>
                    <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.batchMode === 'merge' ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                      <input type="radio" name="batch" value="merge" ${this.batchMode === 'merge' ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                      <span>
                        <span class="block text-sm font-semibold text-slate-800">Fusionar en un único libro</span>
                        <span class="block text-xs text-slate-500">Une todos los documentos en un solo ePub con un índice común.</span>
                      </span>
                    </label>
                    <label class="mt-2 flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.batchMode === 'queue' ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                      <input type="radio" name="batch" value="queue" ${this.batchMode === 'queue' ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                      <span>
                        <span class="block text-sm font-semibold text-slate-800">Cola de conversiones</span>
                        <span class="block text-xs text-slate-500">Convierte cada documento en su propio ePub independiente.</span>
                      </span>
                    </label>
                  </div>`
                : ''
            }

            ${
              hasPdf
                ? `<div class="mt-4 bg-white rounded-xl border border-slate-200 shadow-xs p-4">
                    <h2 class="text-sm font-bold text-slate-800 mb-3">Opciones de PDF</h2>
                    <div class="grid sm:grid-cols-2 gap-3">
                      <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.mode === 'reflow' ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                        <input type="radio" name="mode" value="reflow" ${this.mode === 'reflow' ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                        <span><span class="block text-sm font-semibold text-slate-800">Texto reflowable</span><span class="block text-xs text-slate-500">Recomendado. Texto seleccionable y adaptable.</span></span>
                      </label>
                      <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.mode === 'image' ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                        <input type="radio" name="mode" value="image" ${this.mode === 'image' ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                        <span><span class="block text-sm font-semibold text-slate-800">Páginas de imagen</span><span class="block text-xs text-slate-500">Fiel a la maquetación original.</span></span>
                      </label>
                    </div>
                    <div class="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
                      <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input id="cv-ocr" type="checkbox" ${this.ocr ? 'checked' : ''} class="rounded text-[#2563EB] focus:ring-[#2563EB]" />
                        Aplicar OCR a páginas escaneadas
                      </label>
                      <div class="flex items-center gap-2">
                        <label class="text-xs text-slate-500">Idioma OCR</label>
                        <select id="cv-ocr-lang" class="text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-[#2563EB]">
                          <option value="spa" ${this.ocrLang === 'spa' ? 'selected' : ''}>Español</option>
                          <option value="eng" ${this.ocrLang === 'eng' ? 'selected' : ''}>Inglés</option>
                          <option value="spa+eng" ${this.ocrLang === 'spa+eng' ? 'selected' : ''}>Español + Inglés</option>
                        </select>
                      </div>
                    </div>
                    <p class="mt-2 text-[11px] text-slate-400">El OCR descarga datos de idioma la primera vez; requiere conexión en ese primer uso.</p>
                  </div>`
                : ''
            }

            ${
              this.busy
                ? `<div class="mt-6 bg-white rounded-xl border border-slate-200 shadow-xs p-4">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-semibold text-slate-700">${escapeHtml(this.statusText || 'Procesando…')}</span>
                      <span class="text-xs font-mono text-slate-500">${this.percent}%</span>
                    </div>
                    <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div class="h-full bg-[#2563EB] transition-all duration-200" style="width:${this.percent}%"></div>
                    </div>
                    ${
                      this.queue.length > 0
                        ? `<ul class="mt-3 flex flex-col gap-1.5">${this.queue
                            .map(
                              (item) => `<li class="flex items-center gap-2 text-xs">
                                <span class="w-2 h-2 rounded-full shrink-0 ${
                                  item.status === 'done'
                                    ? 'bg-emerald-500'
                                    : item.status === 'error'
                                      ? 'bg-red-500'
                                      : item.status === 'working'
                                        ? 'bg-blue-500 animate-pulse'
                                        : 'bg-slate-300'
                                }"></span>
                                <span class="truncate ${item.status === 'error' ? 'text-red-600' : 'text-slate-600'}">${escapeHtml(item.fileName)}</span>
                                ${item.message ? `<span class="text-slate-400 truncate">— ${escapeHtml(item.message)}</span>` : ''}
                              </li>`
                            )
                            .join('')}</ul>`
                        : ''
                    }
                  </div>`
                : `<div class="mt-6 flex items-center justify-end gap-3">
                    <button id="cv-convert" class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200 cursor-pointer">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                      ${isBatch ? (this.batchMode === 'merge' ? 'Convertir y fusionar' : `Convertir ${this.files.length} documentos`) : 'Convertir a ePub'}
                    </button>
                  </div>`
            }`
          : ''
      }
    `;

    this.bind(hasFiles, isBatch);
  }

  private bind(hasFiles: boolean, isBatch: boolean) {
    this.container.querySelector('#cv-cancel')?.addEventListener('click', () => {
      if (!this.busy) this.callbacks.onCancel();
    });

    const dropzone = this.container.querySelector<HTMLElement>('#cv-dropzone');
    const input = this.container.querySelector<HTMLInputElement>('#cv-file-input');
    dropzone?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      if (input.files) this.addFiles(Array.from(input.files));
      input.value = '';
    });

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-[#2563EB]', 'bg-blue-50/40');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-[#2563EB]', 'bg-blue-50/40');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-[#2563EB]', 'bg-blue-50/40');
        if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
      });
    }

    this.container.querySelector('#cv-clear')?.addEventListener('click', () => {
      this.files = [];
      this.render();
    });

    this.container.querySelectorAll<HTMLElement>('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove'));
        this.files.splice(idx, 1);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.mode = radio.value as ImportMode;
        this.render();
      });
    });
    this.container.querySelectorAll<HTMLInputElement>('input[name="batch"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.batchMode = radio.value as 'queue' | 'merge';
        this.render();
      });
    });
    this.container.querySelector<HTMLInputElement>('#cv-ocr')?.addEventListener('change', (e) => {
      this.ocr = (e.target as HTMLInputElement).checked;
      this.render();
    });
    this.container.querySelector<HTMLSelectElement>('#cv-ocr-lang')?.addEventListener('change', (e) => {
      this.ocrLang = (e.target as HTMLSelectElement).value;
      this.render();
    });

    if (hasFiles && !this.busy) {
      this.container.querySelector('#cv-convert')?.addEventListener('click', () => this.start());
    }
  }

  private addFiles(newFiles: File[]) {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of newFiles) {
      if (detectKind(file.name)) accepted.push(file);
      else rejected.push(file.name);
    }
    if (rejected.length > 0) {
      showToast({ message: `Formato no soportado: ${rejected.join(', ')}`, type: 'warning' });
    }
    // Replace selection with the new batch for predictable behaviour.
    this.files = accepted;
    if (accepted.length > 0) this.render();
  }

  private async start() {
    if (this.busy || this.files.length === 0) return;
    this.busy = true;
    this.queue = this.files.map((f, i) => ({
      id: `f-${i}`,
      fileName: f.name,
      kind: detectKind(f.name) as SourceKind,
      status: 'pending',
    }));
    this.render();

    try {
      if (this.files.length === 1) {
        const projectId = await this.convertSingle(this.files[0], 0);
        this.busy = false;
        showToast({ message: '¡Libro creado! Revisa los capítulos.', type: 'success' });
        this.callbacks.onConverted(projectId);
        return;
      }

      if (this.batchMode === 'merge') {
        const projectId = await this.convertMerged();
        this.busy = false;
        showToast({ message: '¡Libro fusionado creado!', type: 'success' });
        this.callbacks.onConverted(projectId);
        return;
      }

      // Queue: each file → its own project.
      for (let i = 0; i < this.files.length; i++) {
        await this.convertSingle(this.files[i], i, true);
      }
      this.busy = false;
      showToast({ message: `Conversión completada: ${this.files.length} libros creados.`, type: 'success' });
      this.callbacks.onConverted(null);
    } catch (err) {
      console.error(err);
      this.busy = false;
      this.statusText = '';
      showToast({ message: (err as Error).message || 'Error durante la conversión', type: 'error' });
      this.render();
    }
  }

  private updateProgress(percent: number, status: string) {
    this.percent = Math.max(0, Math.min(100, percent));
    this.statusText = status;
    const bar = this.container.querySelector<HTMLElement>('.bg-\\[\\#2563EB\\].transition-all');
    if (bar) bar.style.width = `${this.percent}%`;
    const label = this.container.querySelector<HTMLElement>('.text-xs.font-mono');
    if (label) label.textContent = `${this.percent}%`;
    const statusEl = this.container.querySelector<HTMLElement>('.text-sm.font-semibold.text-slate-700');
    if (statusEl) statusEl.textContent = status;
  }

  private setQueueItem(index: number, patch: Partial<BatchItem>) {
    this.queue[index] = { ...this.queue[index], ...patch };
    this.renderQueueStatus();
  }

  private renderQueueStatus() {
    // Lightweight refresh: rerender is cheap enough for small batches.
    if (this.queue.length > 0) this.render();
  }

  private async convertSingle(file: File, index: number, keepBusy = false): Promise<number> {
    this.setQueueItem(index, { status: 'working', message: 'Convirtiendo…' });
    const output = await convertFile(file, {
      mode: this.mode,
      ocr: this.ocr,
      ocrLang: this.ocrLang,
      onProgress: (p) => this.updateProgress(p.percent, `${file.name}: ${p.status}`),
    });

    if (output.result.warnings.length > 0) {
      showToast({ message: output.result.warnings[0], type: 'warning', duration: 6000 });
    }

    const projectId = await this.persistProject(
      output.result.title,
      file.name,
      output.kind,
      output.result.author,
      output.result.chapters.map((c, i) => ({ title: c.title, html: c.html, include: true, order: i })),
      output.assets,
      output.result.wordCount
    );

    this.setQueueItem(index, { status: 'done', message: `${output.result.chapters.length} capítulos`, projectId });
    if (!keepBusy) this.updateProgress(100, 'Completado');
    return projectId;
  }

  private async convertMerged(): Promise<number> {
    const allChapters: { title: string; html: string; include: boolean; order: number }[] = [];
    const allAssets: Omit<AssetRecord, 'id' | 'projectId'>[] = [];
    let title = '';
    let author = '';
    let wordCount = 0;
    let order = 0;

    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];
      this.setQueueItem(i, { status: 'working', message: 'Convirtiendo…' });
      const output = await convertFile(file, {
        mode: this.mode,
        ocr: this.ocr,
        ocrLang: this.ocrLang,
        onProgress: (p) => this.updateProgress(p.percent, `${file.name}: ${p.status}`),
      });

      const prefix = `p${i + 1}-`;
      const renames = new Map<string, string>();
      for (const asset of output.assets) {
        const newName = `${prefix}${asset.fileName}`;
        renames.set(asset.fileName, newName);
        allAssets.push({ ...asset, fileName: newName });
      }

      for (const chapter of output.result.chapters) {
        let html = chapter.html;
        renames.forEach((newName, oldName) => {
          html = html.split(`images/${oldName}`).join(`images/${newName}`);
        });
        allChapters.push({ title: chapter.title, html, include: true, order: order++ });
      }

      if (!title) title = output.result.title;
      if (!author && output.result.author) author = output.result.author;
      wordCount += output.result.wordCount;
      this.setQueueItem(i, { status: 'done', message: `${output.result.chapters.length} capítulos` });
    }

    const mergedTitle = title || baseName(this.files[0].name);
    const projectId = await this.persistProject(
      `${mergedTitle} (libro combinado)`,
      this.files.map((f) => f.name).join(', '),
      detectKind(this.files[0].name) as SourceKind,
      author,
      allChapters,
      allAssets,
      wordCount
    );
    this.updateProgress(100, 'Libro fusionado creado');
    return projectId;
  }

  private async persistProject(
    title: string,
    sourceName: string,
    sourceKind: SourceKind,
    author: string,
    chapters: { title: string; html: string; include: boolean; order: number }[],
    assets: Omit<AssetRecord, 'id' | 'projectId'>[],
    wordCount: number
  ): Promise<number> {
    const now = Date.now();
    const project: ProjectRecord = {
      title: title.trim() || 'Libro sin título',
      author: author.trim(),
      description: '',
      language: 'es',
      publisher: '',
      series: '',
      isbn: '',
      rights: '',
      primaryColor: '#2563EB',
      brandName: '',
      sourceName,
      sourceKind,
      importMode: this.mode,
      chapterCount: chapters.length,
      wordCount,
      folderId: this.folderId,
      createdAt: now,
      updatedAt: now,
    };
    const id = await createProject(project);
    await replaceProjectChapters(id, chapters);
    if (assets.length > 0) {
      await replaceProjectAssets(id, assets);
    }
    return id;
  }
}
