import { showToast } from '../components/Toast';
import { StepNav } from '../components/StepNav';
import { getProject, getProjectAssets, getProjectChapters } from '../db/db';
import { buildEpub } from '../epub/builder';
import { safeFileName, shareOrDownloadBlob } from '../utils/share';
import type { AppView, AssetRecord, ChapterRecord, ProjectRecord } from '../types';

export interface ExportCallbacks {
  onBack: () => void;
  onNavigate: (view: AppView, projectId: number) => void;
  onPreview: (projectId: number) => void;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class ExportView {
  private container: HTMLElement;
  private callbacks: ExportCallbacks;
  private stepNav: StepNav;
  private projectId?: number;
  private project?: ProjectRecord;
  private chapters: ChapterRecord[] = [];
  private assets: AssetRecord[] = [];
  private version: 2 | 3 = 3;
  private kepub = false;
  private busy = false;
  private status = '';

  constructor(callbacks: ExportCallbacks) {
    this.callbacks = callbacks;
    this.stepNav = new StepNav((view) => {
      if (this.projectId) this.callbacks.onNavigate(view, this.projectId);
    });
    this.container = document.createElement('div');
    this.container.className = 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  async load(projectId: number) {
    this.projectId = projectId;
    this.project = await getProject(projectId);
    this.chapters = (await getProjectChapters(projectId)).filter((c) => c.include);
    this.assets = await getProjectAssets(projectId);
    this.render();
  }

  private render() {
    this.stepNav.render('export', true);
    const included = this.chapters;
    const words = included.reduce(
      (sum, c) => sum + c.html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length,
      0
    );

    this.container.innerHTML = '';
    this.container.appendChild(this.stepNav.getElement());

    const panel = document.createElement('div');
    panel.innerHTML = `
      <div class="mb-6">
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Exportar ePub</h1>
        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.project?.title ?? '')}</p>
      </div>

      <div class="grid lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 flex flex-col gap-4">
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <h2 class="text-sm font-bold text-slate-800 mb-4">Formato de salida</h2>
            <div class="grid sm:grid-cols-2 gap-3">
              <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.version === 3 ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                <input type="radio" name="ver" value="3" ${this.version === 3 ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                <span><span class="block text-sm font-semibold text-slate-800">EPUB 3</span><span class="block text-xs text-slate-500">Recomendado. Compatible con lectores modernos.</span></span>
              </label>
              <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${this.version === 2 ? 'border-[#2563EB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}">
                <input type="radio" name="ver" value="2" ${this.version === 2 ? 'checked' : ''} class="mt-1 text-[#2563EB] focus:ring-[#2563EB]" />
                <span><span class="block text-sm font-semibold text-slate-800">EPUB 2</span><span class="block text-xs text-slate-500">Máxima compatibilidad con lectores antiguos.</span></span>
              </label>
            </div>
            <label class="mt-4 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input id="ex-kepub" type="checkbox" ${this.kepub ? 'checked' : ''} class="rounded text-[#2563EB] focus:ring-[#2563EB]" />
              Generar variante Kepub (lectores Kobo)
            </label>
          </div>

          <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <h2 class="text-sm font-bold text-slate-800 mb-3">Índice (TOC)</h2>
            <ol class="flex flex-col gap-1.5 max-h-64 overflow-auto pr-1">
              ${included
                .map(
                  (c, i) => `<li class="flex items-start gap-2 text-sm text-slate-600">
                    <span class="text-[11px] font-mono text-slate-400 mt-0.5 shrink-0">${i + 1}.</span>
                    <span class="truncate">${escapeHtml(c.title || `Capítulo ${i + 1}`)}</span>
                  </li>`
                )
                .join('')}
            </ol>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 h-fit">
          <h2 class="text-sm font-bold text-slate-800 mb-3">Resumen</h2>
          <dl class="text-sm text-slate-600 flex flex-col gap-2">
            <div class="flex justify-between"><dt class="text-slate-500">Capítulos</dt><dd class="font-semibold text-slate-800">${included.length}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Imágenes</dt><dd class="font-semibold text-slate-800">${this.assets.length}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Palabras</dt><dd class="font-semibold text-slate-800">${words.toLocaleString('es-ES')}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Carátula</dt><dd class="font-semibold text-slate-800">${this.project?.coverBlob ? 'Sí' : 'No'}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Idioma</dt><dd class="font-semibold text-slate-800">${escapeHtml(this.project?.language ?? 'es')}</dd></div>
          </dl>

          ${
            this.busy
              ? `<div class="mt-5">
                  <div class="flex items-center gap-2 text-xs text-slate-500 mb-2"><span class="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>${escapeHtml(this.status)}</div>
                  <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full w-1/2 bg-[#2563EB] ef-pulse"></div></div>
                </div>`
              : `<div class="mt-5 flex flex-col gap-2">
                  <button id="ex-download" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200 cursor-pointer">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Descargar ePub
                  </button>
                  <button id="ex-share" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition cursor-pointer">
                    <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    Compartir
                  </button>
                </div>`
          }
        </div>
      </div>
    `;
    this.container.appendChild(panel);
    this.bind();
  }

  private bind() {
    this.container.querySelectorAll<HTMLInputElement>('input[name="ver"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.version = radio.value === '2' ? 2 : 3;
        this.render();
      });
    });
    this.container.querySelector<HTMLInputElement>('#ex-kepub')?.addEventListener('change', (e) => {
      this.kepub = (e.target as HTMLInputElement).checked;
      this.render();
    });
    this.container.querySelector('#ex-download')?.addEventListener('click', () => this.export(false));
    this.container.querySelector('#ex-share')?.addEventListener('click', () => this.export(true));
  }

  private async export(share: boolean) {
    if (!this.projectId || !this.project || this.busy) return;
    this.busy = true;
    this.status = 'Preparando el libro…';
    this.render();
    try {
      this.status = 'Generando el ePub…';
      const blob = await buildEpub({
        title: this.project.title,
        author: this.project.author,
        language: this.project.language || 'es',
        publisher: this.project.publisher,
        description: this.project.description,
        rights: this.project.rights,
        isbn: this.project.isbn,
        version: this.version,
        kepub: this.kepub,
        chapters: this.chapters.map((c) => ({ title: c.title, html: c.html })),
        assets: this.assets.map((a) => ({ fileName: a.fileName, mime: a.mime, blob: a.blob })),
        coverBlob: this.project.coverBlob ?? null,
      });

      const base = safeFileName(this.project.title);
      const fileName = this.kepub ? `${base}.kepub.epub` : `${base}.epub`;

      if (share) {
        const outcome = await shareOrDownloadBlob(
          blob,
          fileName,
          'application/epub+zip',
          this.project.title,
          `ePub generado con ePubFacil: ${this.project.title}`
        );
        if (outcome === 'shared') showToast({ message: 'ePub compartido.', type: 'success' });
        else if (outcome === 'downloaded') showToast({ message: 'ePub descargado.', type: 'success' });
      } else {
        await shareOrDownloadBlob(blob, fileName, 'application/epub+zip', this.project.title, fileName);
        showToast({ message: '¡ePub descargado!', type: 'success' });
      }
    } catch (err) {
      console.error(err);
      showToast({ message: (err as Error).message || 'Error al generar el ePub', type: 'error' });
    } finally {
      this.busy = false;
      this.status = '';
      this.render();
    }
  }
}
