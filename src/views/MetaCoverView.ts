import { showToast } from '../components/Toast';
import { StepNav } from '../components/StepNav';
import { getProject, getProjectAssets, updateProject } from '../db/db';
import { generateCoverBlob, resizeCoverBlob } from '../utils/cover';
import { AutoSaver, saveStatusLabel } from '../utils/autosave';
import type { AppView, ProjectRecord } from '../types';

export interface MetaCallbacks {
  onBack: () => void;
  onNavigate: (view: AppView, projectId: number) => void;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const COLORS = [
  { name: 'Azul ePubFacil', color: '#2563EB' },
  { name: 'Turquesa', color: '#0D9488' },
  { name: 'Esmeralda', color: '#059669' },
  { name: 'Violeta', color: '#7C3AED' },
  { name: 'Carmesí', color: '#DC2626' },
  { name: 'Ámbar', color: '#D97706' },
  { name: 'Grafito', color: '#334155' },
];

export class MetaCoverView {
  private container: HTMLElement;
  private callbacks: MetaCallbacks;
  private stepNav: StepNav;
  private projectId?: number;
  private project?: ProjectRecord;
  private coverBlob: Blob | null = null;
  private coverUrl: string | null = null;
  private firstImageBlob: Blob | null = null;
  private saver: AutoSaver;
  private lastSavedAt?: Date;

  constructor(callbacks: MetaCallbacks) {
    this.callbacks = callbacks;
    this.saver = new AutoSaver(() => this.persistMeta(), {
      delay: 900,
      onState: (state) => {
        if (state === 'saved') this.lastSavedAt = new Date();
        this.setStatus(state);
      },
    });
    this.stepNav = new StepNav((view) => {
      if (this.projectId) this.callbacks.onNavigate(view, this.projectId);
    });
    this.container = document.createElement('div');
    this.container.className = 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  /** Completes any pending auto-save (called before leaving the view). */
  public async flush(): Promise<void> {
    await this.saver.flush();
  }

  private setStatus(state: Parameters<typeof saveStatusLabel>[0]) {
    const el = document.querySelector<HTMLElement>('#meta-status');
    if (!el) return;
    el.textContent = saveStatusLabel(state, this.lastSavedAt);
    el.className = `text-[11px] font-medium ${state === 'error' ? 'text-red-500' : 'text-slate-400'}`;
  }

  destroy() {
    void this.saver.flush();
    this.revokeCover();
  }

  private revokeCover() {
    if (this.coverUrl) {
      URL.revokeObjectURL(this.coverUrl);
      this.coverUrl = null;
    }
  }

  async load(projectId: number) {
    this.projectId = projectId;
    this.project = await getProject(projectId);
    this.coverBlob = this.project?.coverBlob ?? null;
    const assets = await getProjectAssets(projectId);
    this.firstImageBlob = assets.length > 0 ? assets[0].blob : null;
    this.setCoverUrl();
    this.render();
  }

  private setCoverUrl() {
    this.revokeCover();
    if (this.coverBlob) this.coverUrl = URL.createObjectURL(this.coverBlob);
  }

  private render() {
    this.stepNav.render('meta', true);
    const p = this.project;
    this.container.innerHTML = '';
    this.container.appendChild(this.stepNav.getElement());

    const panel = document.createElement('div');
    panel.innerHTML = `
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">Carátula y metadatos</h1>
          <p class="mt-1 text-sm text-slate-500">Datos que verás en los lectores de ePub.</p>
        </div>
        <div class="flex items-center gap-3">
          <span id="meta-status" data-savestatus class="hidden sm:inline text-[11px] font-medium text-slate-400"></span>
          <button id="meta-next" class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200 cursor-pointer">
            Exportar
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </div>

      <div class="grid lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 class="text-sm font-bold text-slate-800 mb-4">Metadatos</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            ${field('meta-title', 'Título', p?.title ?? '', true)}
            ${field('meta-author', 'Autor', p?.author ?? '')}
            ${selectField('meta-language', 'Idioma', p?.language ?? 'es', [
              ['es', 'Español'],
              ['en', 'English'],
              ['fr', 'Français'],
              ['de', 'Deutsch'],
              ['it', 'Italiano'],
              ['pt', 'Português'],
            ])}
            ${field('meta-publisher', 'Editorial', p?.publisher ?? '')}
            ${field('meta-series', 'Colección / Serie', p?.series ?? '')}
            ${field('meta-isbn', 'ISBN', p?.isbn ?? '')}
            ${field('meta-brand', 'Marca / sello', p?.brandName ?? '')}
            ${field('meta-rights', 'Derechos', p?.rights ?? '')}
          </div>
          <div class="mt-4">
            <label class="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
            <textarea id="meta-description" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden resize-none">${escapeHtml(p?.description ?? '')}</textarea>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-semibold text-slate-600 mb-2">Color de marca</label>
            <div class="flex flex-wrap gap-2">
              ${COLORS.map(
                (c) => `<button data-color="${c.color}" title="${c.name}" class="w-8 h-8 rounded-full border-2 ${ (p?.primaryColor ?? '#2563EB') === c.color ? 'border-slate-800' : 'border-white shadow' } cursor-pointer" style="background-color:${c.color}"></button>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 class="text-sm font-bold text-slate-800 mb-4">Carátula</h2>
          <div class="aspect-3/4 w-full rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
            ${
              this.coverUrl
                ? `<img src="${this.coverUrl}" alt="Carátula" class="w-full h-full object-cover" />`
                : `<span class="text-xs text-slate-400">Sin carátula</span>`
            }
          </div>
          <div class="mt-4 flex flex-col gap-2">
            <button id="cover-generate" class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-[#2563EB] text-xs font-semibold hover:bg-blue-100 transition cursor-pointer">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path></svg>
              Generar carátula
            </button>
            <label class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>
              Subir imagen
              <input id="cover-upload" type="file" accept="image/*" class="hidden" />
            </label>
            ${
              this.firstImageBlob
                ? `<button id="cover-from-asset" class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer">Usar primera imagen del libro</button>`
                : ''
            }
            ${
              this.coverUrl
                ? `<button id="cover-remove" class="text-xs font-semibold text-slate-400 hover:text-red-600 transition cursor-pointer">Quitar carátula</button>`
                : ''
            }
          </div>
        </div>
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
        <button id="meta-save" class="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-[#2563EB] text-sm font-semibold hover:bg-blue-100 transition cursor-pointer">Guardar</button>
        <button id="meta-next2" class="px-5 py-2.5 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200 cursor-pointer">Exportar ePub</button>
      </div>
    `;
    this.container.appendChild(panel);
    this.bind();
  }

  private readFormValues() {
    return {
      title: val('meta-title'),
      author: val('meta-author'),
      language: val('meta-language'),
      publisher: val('meta-publisher'),
      series: val('meta-series'),
      isbn: val('meta-isbn'),
      brandName: val('meta-brand'),
      rights: val('meta-rights'),
      description: val('meta-description'),
    };
  }

  private syncFormToProject() {
    if (this.project) Object.assign(this.project, this.readFormValues());
  }

  private async persistMeta(): Promise<void> {
    if (!this.projectId) return;
    const form = this.readFormValues();
    if (this.project) Object.assign(this.project, form);
    await updateProject(this.projectId, {
      ...form,
      primaryColor: this.project?.primaryColor || '#2563EB',
      coverBlob: this.coverBlob ?? undefined,
    });
  }

  private bind() {
    // Every field change is auto-saved (debounced).
    this.container
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('#meta-title, #meta-author, #meta-language, #meta-publisher, #meta-series, #meta-isbn, #meta-brand, #meta-rights, #meta-description')
      .forEach((el) => {
        el.addEventListener('input', () => this.saver.schedule());
        el.addEventListener('change', () => this.saver.schedule());
      });

    this.container.querySelectorAll<HTMLElement>('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.project) return;
        this.project.primaryColor = btn.getAttribute('data-color') || '#2563EB';
        this.container.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => {
          b.className = `w-8 h-8 rounded-full border-2 ${b === btn ? 'border-slate-800' : 'border-white shadow'} cursor-pointer`;
        });
        this.saver.schedule();
      });
    });

    this.container.querySelector('#cover-generate')?.addEventListener('click', async () => {
      const form = this.readFormValues();
      const color = this.project?.primaryColor || '#2563EB';
      const cover = await generateCoverBlob({
        title: form.title || 'Sin título',
        author: form.author,
        brandName: form.brandName || 'ePubFacil',
        primaryColor: color,
      });
      this.coverBlob = cover.blob;
      this.setCoverUrl();
      this.syncFormToProject();
      this.render();
      this.saver.schedule();
    });

    const upload = this.container.querySelector<HTMLInputElement>('#cover-upload');
    upload?.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      const resized = await resizeCoverBlob(file);
      this.coverBlob = resized;
      this.setCoverUrl();
      this.syncFormToProject();
      this.render();
      this.saver.schedule();
    });

    this.container.querySelector('#cover-from-asset')?.addEventListener('click', async () => {
      if (this.firstImageBlob) {
        this.coverBlob = await resizeCoverBlob(this.firstImageBlob);
        this.setCoverUrl();
        this.syncFormToProject();
        this.render();
        this.saver.schedule();
      }
    });

    this.container.querySelector('#cover-remove')?.addEventListener('click', () => {
      this.coverBlob = null;
      this.setCoverUrl();
      this.syncFormToProject();
      this.render();
      this.saver.schedule();
    });

    const finish = async (navigate: boolean) => {
      await this.saver.flush();
      if (navigate) {
        if (this.projectId) this.callbacks.onNavigate('export', this.projectId);
      } else {
        showToast({ message: 'Metadatos guardados.', type: 'success' });
      }
    };

    this.container.querySelector('#meta-save')?.addEventListener('click', () => void finish(false));
    this.container.querySelector('#meta-next')?.addEventListener('click', () => void finish(true));
    this.container.querySelector('#meta-next2')?.addEventListener('click', () => void finish(true));
  }
}

function val(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return el ? el.value.trim() : '';
}

function field(id: string, label: string, value: string, required = false): string {
  return `<div>
    <label class="block text-xs font-semibold text-slate-600 mb-1">${label}${required ? ' *' : ''}</label>
    <input id="${id}" type="text" value="${escapeHtml(value)}" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden" />
  </div>`;
}

function selectField(id: string, label: string, value: string, options: [string, string][]): string {
  return `<div>
    <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
    <select id="${id}" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden">
      ${options.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
  </div>`;
}
