import { showToast } from '../components/Toast';
import { getProjectAssets } from '../db/db';
import { getProject, getProjectChapters } from '../db/db';
import type { ChapterRecord, ProjectRecord } from '../types';

export interface PreviewCallbacks {
  onBack: () => void;
  onEdit: (projectId: number) => void;
  onExport: (projectId: number) => void;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class PreviewView {
  private container: HTMLElement;
  private callbacks: PreviewCallbacks;
  private projectId?: number;
  private project?: ProjectRecord;
  private chapters: ChapterRecord[] = [];
  private index = 0;
  private assetUrls = new Map<string, string>();
  private coverUrl: string | null = null;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(callbacks: PreviewCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className = 'w-full';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.assetUrls.forEach((url) => URL.revokeObjectURL(url));
    this.assetUrls.clear();
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
  }

  async load(projectId: number) {
    this.projectId = projectId;
    this.project = await getProject(projectId);
    this.chapters = (await getProjectChapters(projectId)).filter((c) => c.include);
    this.index = 0;
    this.coverUrl = this.project?.coverBlob ? URL.createObjectURL(this.project.coverBlob) : null;
    await this.prepareAssets();
    this.render();
    window.addEventListener('keydown', this.keyHandler);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') this.go(this.index + 1);
    else if (e.key === 'ArrowLeft') this.go(this.index - 1);
  }

  private go(delta: number) {
    const next = Math.min(Math.max(delta, 0), Math.max(0, this.chapters.length - 1));
    if (next !== this.index) {
      this.index = next;
      this.renderContent();
    }
  }

  private resolveImages(html: string): string {
    // Rewrites "images/xxx" references to blob URLs from IndexedDB assets.
    return html.replace(/src=("|')images\/([^"']+)\1/g, (match, quote: string, fileName: string) => {
      const url = this.assetUrls.get(fileName);
      return url ? `src=${quote}${url}${quote}` : match;
    });
  }

  async prepareAssets() {
    if (!this.projectId) return;
    const assets = await getProjectAssets(this.projectId);
    for (const asset of assets) {
      if (!this.assetUrls.has(asset.fileName)) {
        this.assetUrls.set(asset.fileName, URL.createObjectURL(asset.blob));
      }
    }
  }

  private render() {
    this.container.innerHTML = `
      <div class="bg-white border-b border-slate-200 sticky top-16 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button id="pv-back" class="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer" title="Volver a la biblioteca">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <div class="min-w-0">
              <p class="text-sm font-bold text-slate-900 truncate">${escapeHtml(this.project?.title ?? '')}</p>
              <p class="text-[11px] text-slate-400">Previsualización del ePub</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="pv-edit" class="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer">Editar</button>
            <button id="pv-export" class="px-3 py-1.5 rounded-md bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer">Exportar</button>
          </div>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        <aside class="hidden lg:block w-64 shrink-0">
          <div class="sticky top-36 bg-white rounded-xl border border-slate-200 shadow-xs p-3 max-h-[70vh] overflow-auto">
            <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Índice</h2>
            <ol class="flex flex-col gap-0.5">
              ${this.chapters
                .map(
                  (c, i) => `<li><button data-goto="${i}" class="w-full text-left px-2 py-1.5 rounded-md text-xs transition cursor-pointer ${
                    i === this.index ? 'bg-blue-50 text-[#2563EB] font-semibold' : 'text-slate-600 hover:bg-slate-50'
                  }"><span class="font-mono text-slate-400 mr-1.5">${i + 1}</span>${escapeHtml(c.title)}</button></li>`
                )
                .join('')}
            </ol>
          </div>
        </aside>

        <main class="flex-1 min-w-0">
          <div id="pv-content" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 min-h-[60vh] epub-preview"></div>
          <div class="mt-4 flex items-center justify-between">
            <button id="pv-prev" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition cursor-pointer disabled:opacity-40">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Anterior
            </button>
            <span id="pv-indicator" class="text-xs font-mono text-slate-500"></span>
            <button id="pv-next" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition cursor-pointer disabled:opacity-40">
              Siguiente <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </main>
      </div>
    `;
    this.bindChrome();
    this.renderContent();
  }

  private bindChrome() {
    this.container.querySelector('#pv-back')?.addEventListener('click', () => this.callbacks.onBack());
    this.container.querySelector('#pv-edit')?.addEventListener('click', () => this.projectId && this.callbacks.onEdit(this.projectId));
    this.container.querySelector('#pv-export')?.addEventListener('click', () => this.projectId && this.callbacks.onExport(this.projectId));
    this.container.querySelector('#pv-prev')?.addEventListener('click', () => this.go(this.index - 1));
    this.container.querySelector('#pv-next')?.addEventListener('click', () => this.go(this.index + 1));
    this.container.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => this.go(Number(btn.getAttribute('data-goto'))));
    });
  }

  private renderContent() {
    const content = this.container.querySelector('#pv-content');
    const indicator = this.container.querySelector('#pv-indicator');
    const prev = this.container.querySelector<HTMLButtonElement>('#pv-prev');
    const next = this.container.querySelector<HTMLButtonElement>('#pv-next');

    const chapter = this.chapters[this.index];
    if (content) {
      content.innerHTML = chapter ? this.resolveImages(chapter.html) : '<p class="text-slate-400">Este libro no tiene capítulos incluidos.</p>';
    }
    if (indicator) indicator.textContent = `${this.index + 1} / ${this.chapters.length}`;
    if (prev) prev.disabled = this.index <= 0;
    if (next) next.disabled = this.index >= this.chapters.length - 1;

    // Refresh TOC highlighting.
    this.container.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn) => {
      const i = Number(btn.getAttribute('data-goto'));
      btn.className = `w-full text-left px-2 py-1.5 rounded-md text-xs transition cursor-pointer ${
        i === this.index ? 'bg-blue-50 text-[#2563EB] font-semibold' : 'text-slate-600 hover:bg-slate-50'
      }`;
    });
  }
}

export function announcePreviewHint() {
  showToast({ message: 'Usa las flechas ← → para navegar entre capítulos.', type: 'info', duration: 3500 });
}
