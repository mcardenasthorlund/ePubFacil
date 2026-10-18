import Sortable from 'sortablejs';
import { showToast } from '../components/Toast';
import { StepNav } from '../components/StepNav';
import { RichTextEditor } from '../components/RichTextEditor';
import type { EditorAssets } from '../components/AssetPicker';
import {
  addProjectAsset,
  getProject,
  getProjectAssets,
  getProjectChapters,
  pruneUnusedAssets,
  replaceProjectChapters,
  updateProject,
} from '../db/db';
import { collectImageFileNames } from '../utils/htmlAssets';
import type { AppView, AssetRecord, ChapterRecord, ProjectRecord } from '../types';

export interface ChaptersCallbacks {
  onBack: () => void;
  onNavigate: (view: AppView, projectId: number) => void;
  onPreview: (projectId: number) => void;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

interface EditableChapter {
  title: string;
  html: string;
  include: boolean;
  wordCount: number;
}

export class ChaptersView {
  private container: HTMLElement;
  private callbacks: ChaptersCallbacks;
  private stepNav: StepNav;
  private projectId?: number;
  private project?: ProjectRecord;
  private chapters: EditableChapter[] = [];
  private sortable: Sortable | null = null;

  private assetList: AssetRecord[] = [];
  private urlCache = new Map<string, string>();

  constructor(callbacks: ChaptersCallbacks) {
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

  destroy() {
    this.sortable?.destroy();
    this.sortable = null;
    this.revokeUrls();
  }

  private revokeUrls() {
    this.urlCache.forEach((url) => URL.revokeObjectURL(url));
    this.urlCache.clear();
  }

  async load(projectId: number) {
    this.projectId = projectId;
    this.project = await getProject(projectId);
    const records = await getProjectChapters(projectId);
    this.chapters = records.map((c) => ({
      title: c.title,
      html: c.html,
      include: c.include,
      wordCount: wordCount(c.html),
    }));
    this.revokeUrls();
    this.assetList = await getProjectAssets(projectId);
    this.render();
  }

  // ---- Editor assets -------------------------------------------------------

  private urlFor(fileName: string): string | undefined {
    const cached = this.urlCache.get(fileName);
    if (cached) return cached;
    const asset = this.assetList.find((a) => a.fileName === fileName);
    if (!asset) return undefined;
    const url = URL.createObjectURL(asset.blob);
    this.urlCache.set(fileName, url);
    return url;
  }

  private buildAssets(): EditorAssets {
    return {
      getUrl: (fileName) => this.urlFor(fileName),
      add: async (blob, mime) => {
        if (!this.projectId) throw new Error('Sin proyecto');
        const record = await addProjectAsset(this.projectId, blob, mime);
        this.assetList.push(record);
        const url = this.urlFor(record.fileName) as string;
        return { fileName: record.fileName, url };
      },
      list: () =>
        this.assetList
          .map((a) => ({ fileName: a.fileName, url: this.urlFor(a.fileName) as string }))
          .filter((entry) => !!entry.url),
    };
  }

  // ---- Chapter list --------------------------------------------------------

  private render() {
    this.stepNav.render('chapters', true);
    const included = this.chapters.filter((c) => c.include);
    const totalWords = included.reduce((sum, c) => sum + c.wordCount, 0);

    this.container.innerHTML = '';
    this.container.appendChild(this.stepNav.getElement());

    const panel = document.createElement('div');
    panel.innerHTML = `
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">Editar capítulos</h1>
          <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.project?.title ?? '')}</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="ch-preview" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition cursor-pointer">
            <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span class="hidden sm:inline">Previsualizar</span>
          </button>
          <button id="ch-next" class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200 cursor-pointer">
            Carátula y datos
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </div>

      <div class="mb-4 flex items-center gap-4 text-xs text-slate-500">
        <span><strong class="text-slate-800">${included.length}</strong> capítulos incluidos de ${this.chapters.length}</span>
        <span>${totalWords.toLocaleString('es-ES')} palabras</span>
      </div>

      <div id="ch-list" class="flex flex-col gap-2">
        ${this.chapters.map((c, i) => this.renderRow(c, i)).join('')}
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button id="ch-add" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-600 text-sm font-medium hover:border-[#2563EB] hover:text-[#2563EB] transition cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Añadir capítulo vacío
        </button>
        <button id="ch-save" class="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-[#2563EB] text-sm font-semibold hover:bg-blue-100 transition cursor-pointer">Guardar cambios</button>
      </div>
    `;
    this.container.appendChild(panel);
    this.bind();
  }

  private renderRow(c: EditableChapter, index: number): string {
    return `
      <div class="chapter-row group flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-xs p-3" data-index="${index}">
        <span class="drag-handle cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0" title="Arrastrar para reordenar">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="18" r="1"></circle><circle cx="15" cy="6" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="18" r="1"></circle></svg>
        </span>
        <input type="checkbox" data-field="include" ${c.include ? 'checked' : ''} class="chapter-include rounded text-[#2563EB] focus:ring-[#2563EB] shrink-0" title="Incluir en el ePub" />
        <div class="flex-1 min-w-0">
          <input type="text" data-field="title" value="${escapeHtml(c.title)}" class="chapter-title w-full px-2 py-1.5 text-sm font-semibold text-slate-800 bg-transparent rounded-md hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] border border-transparent focus:border-[#2563EB] transition" />
          <p class="px-2 text-[11px] text-slate-400 mt-0.5">${c.wordCount.toLocaleString('es-ES')} palabras</p>
        </div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button data-act="edit" title="Editar contenido" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-50 text-[#2563EB] hover:bg-blue-100 text-xs font-semibold transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg><span class="hidden sm:inline">Editar</span></button>
          <button data-act="merge" title="Fusionar con el siguiente" class="p-1.5 rounded text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition cursor-pointer disabled:opacity-30" ${index === this.chapters.length - 1 ? 'disabled' : ''}><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 15 12 20 17 15"></polyline><line x1="12" y1="4" x2="12" y2="20"></line></svg></button>
          <button data-act="delete" title="Eliminar capítulo" class="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </div>`;
  }

  private collectFromDom() {
    this.container.querySelectorAll<HTMLElement>('.chapter-row').forEach((row) => {
      const index = Number(row.getAttribute('data-index'));
      if (Number.isNaN(index) || !this.chapters[index]) return;
      const titleInput = row.querySelector<HTMLInputElement>('.chapter-title');
      const includeInput = row.querySelector<HTMLInputElement>('.chapter-include');
      if (titleInput) this.chapters[index].title = titleInput.value;
      if (includeInput) this.chapters[index].include = includeInput.checked;
    });
  }

  private bind() {
    const list = this.container.querySelector<HTMLElement>('#ch-list');
    if (list) {
      this.sortable?.destroy();
      this.sortable = Sortable.create(list, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: () => {
          this.collectFromDom();
          const rows = Array.from(list.querySelectorAll<HTMLElement>('.chapter-row'));
          const reordered: EditableChapter[] = [];
          for (const row of rows) {
            const index = Number(row.getAttribute('data-index'));
            if (!Number.isNaN(index) && this.chapters[index]) reordered.push(this.chapters[index]);
          }
          this.chapters = reordered;
          this.render();
        },
      });
    }

    this.container.querySelector('#ch-preview')?.addEventListener('click', () => {
      this.collectFromDom();
      this.persist().then(() => this.projectId && this.callbacks.onPreview(this.projectId));
    });

    this.container.querySelector('#ch-next')?.addEventListener('click', async () => {
      this.collectFromDom();
      const id = await this.persist();
      if (id) this.callbacks.onNavigate('meta', id);
    });

    this.container.querySelector('#ch-save')?.addEventListener('click', async () => {
      this.collectFromDom();
      await this.persist();
      showToast({ message: 'Cambios guardados.', type: 'success' });
    });

    this.container.querySelector('#ch-add')?.addEventListener('click', () => {
      this.collectFromDom();
      this.chapters.push({ title: 'Nuevo capítulo', html: '<p></p>', include: true, wordCount: 0 });
      this.render();
    });

    this.container.querySelectorAll<HTMLElement>('.chapter-row').forEach((row) => {
      const index = Number(row.getAttribute('data-index'));
      row.querySelectorAll<HTMLElement>('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          this.collectFromDom();
          if (act === 'delete') {
            this.chapters.splice(index, 1);
            this.render();
          } else if (act === 'merge') {
            if (index < this.chapters.length - 1) {
              const a = this.chapters[index];
              const b = this.chapters[index + 1];
              a.html = `${a.html}\n${b.html}`;
              a.title = a.title || b.title;
              a.wordCount = wordCount(a.html);
              this.chapters.splice(index + 1, 1);
              this.render();
            }
          } else if (act === 'edit') {
            this.openEditor(index);
          }
        });
      });
    });
  }

  // ---- Full-screen content editor -----------------------------------------

  private openEditor(index: number) {
    if (!this.projectId) return;
    this.collectFromDom();

    let current = index;
    let advanced = false;
    let editor: RichTextEditor | null = null;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[60] bg-[#F8FAFC] flex flex-col';
    overlay.innerHTML = `
      <header class="bg-white border-b border-slate-200 shrink-0">
        <div class="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <button id="ce-close" class="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer" title="Volver a la lista">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <input id="ce-title" type="text" class="min-w-0 flex-1 px-3 py-1.5 text-sm font-bold text-slate-900 bg-transparent rounded-md hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] border border-transparent focus:border-[#2563EB] transition" />
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span id="ce-words" class="hidden sm:inline text-xs text-slate-400 font-mono"></span>
            <button id="ce-html-toggle" class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer">&lt;/&gt; HTML</button>
            <button id="ce-save" class="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 shadow-sm shadow-blue-200 cursor-pointer">Guardar</button>
          </div>
        </div>
      </header>
      <div class="flex-1 overflow-hidden max-w-7xl w-full mx-auto flex gap-4 p-3 sm:p-4">
        <aside class="hidden lg:block w-56 shrink-0 overflow-auto">
          <p class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Capítulos</p>
          <ol id="ce-list" class="flex flex-col gap-0.5"></ol>
        </aside>
        <main class="flex-1 overflow-auto">
          <div id="ce-host" class="max-w-3xl mx-auto"></div>
          <textarea id="ce-html" class="hidden w-full max-w-3xl mx-auto h-[70vh] px-4 py-3 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden resize-none"></textarea>
        </main>
      </div>`;
    document.body.appendChild(overlay);

    const host = overlay.querySelector<HTMLElement>('#ce-host')!;
    const textarea = overlay.querySelector<HTMLTextAreaElement>('#ce-html')!;
    const titleInput = overlay.querySelector<HTMLInputElement>('#ce-title')!;
    const wordsEl = overlay.querySelector<HTMLElement>('#ce-words')!;
    const listEl = overlay.querySelector<HTMLElement>('#ce-list')!;

    const updateWords = () => {
      const words = advanced ? wordCount(textarea.value) : editor?.getWordCount() ?? 0;
      wordsEl.textContent = `${words.toLocaleString('es-ES')} palabras`;
    };

    const renderSidebar = () => {
      listEl.innerHTML = this.chapters
        .map(
          (c, i) => `<li><button data-goto="${i}" class="w-full text-left px-2 py-1.5 rounded-md text-xs transition cursor-pointer ${
            i === current ? 'bg-blue-50 text-[#2563EB] font-semibold' : 'text-slate-600 hover:bg-slate-50'
          }"><span class="font-mono text-slate-400 mr-1.5">${i + 1}</span>${escapeHtml(c.title || `Capítulo ${i + 1}`)}</button></li>`
        )
        .join('');
      listEl.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (Number(btn.getAttribute('data-goto')) !== current) {
            syncFromEditor();
            current = Number(btn.getAttribute('data-goto'));
            loadCurrent();
          }
        });
      });
    };

    const loadCurrent = () => {
      const chapter = this.chapters[current];
      titleInput.value = chapter.title;
      if (advanced) textarea.value = chapter.html;
      else editor?.setHtml(chapter.html);
      renderSidebar();
      updateWords();
    };

    const syncFromEditor = () => {
      const chapter = this.chapters[current];
      chapter.title = titleInput.value;
      chapter.html = advanced ? textarea.value : editor?.getHtml() ?? chapter.html;
      chapter.wordCount = wordCount(chapter.html);
    };

    let autosaveTimer: number | null = null;
    const scheduleAutosave = () => {
      if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(async () => {
        autosaveTimer = null;
        syncFromEditor();
        await this.persist();
      }, 2500);
    };
    const cancelAutosave = () => {
      if (autosaveTimer !== null) {
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
    };

    editor = new RichTextEditor({
      initialHtml: this.chapters[current].html,
      assets: this.buildAssets(),
      onChange: () => {
        updateWords();
        scheduleAutosave();
      },
    });
    host.appendChild(editor.getElement());

    titleInput.addEventListener('input', () => {
      updateWords();
      scheduleAutosave();
    });
    textarea.addEventListener('input', () => {
      updateWords();
      scheduleAutosave();
    });

    overlay.querySelector('#ce-html-toggle')?.addEventListener('click', () => {
      if (!advanced) {
        syncFromEditor();
        textarea.value = this.chapters[current].html;
      } else {
        this.chapters[current].html = textarea.value;
        editor?.setHtml(textarea.value);
      }
      advanced = !advanced;
      host.classList.toggle('hidden', advanced);
      textarea.classList.toggle('hidden', !advanced);
      updateWords();
    });

    overlay.querySelector('#ce-save')?.addEventListener('click', async () => {
      cancelAutosave();
      syncFromEditor();
      await this.persist();
      showToast({ message: 'Capítulo guardado.', type: 'success' });
      renderSidebar();
    });

    overlay.querySelector('#ce-close')?.addEventListener('click', async () => {
      cancelAutosave();
      syncFromEditor();
      await this.persist();
      editor?.destroy();
      this.revokeUrls();
      document.body.removeChild(overlay);
      this.render();
    });

    overlay.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        (overlay.querySelector('#ce-save') as HTMLElement)?.click();
      }
    });

    loadCurrent();
  }

  // ---- Persistence ---------------------------------------------------------

  private async persist(): Promise<number | undefined> {
    if (!this.projectId) return undefined;
    await replaceProjectChapters(
      this.projectId,
      this.chapters.map((c, i) => ({ order: i, title: c.title, html: c.html, include: c.include }))
    );
    await updateProject(this.projectId, {
      chapterCount: this.chapters.filter((c) => c.include).length,
      wordCount: this.chapters.filter((c) => c.include).reduce((sum, c) => sum + c.wordCount, 0),
    });

    // Reclaim images that are no longer referenced by any chapter.
    const used = new Set<string>();
    this.chapters.forEach((c) => collectImageFileNames(c.html).forEach((f) => used.add(f)));
    try {
      await pruneUnusedAssets(this.projectId, used);
    } catch (err) {
      console.warn('No se pudieron purgar imágenes sin uso:', err);
    }

    return this.projectId;
  }
}

export type { ChapterRecord };
