import {
  addFolder,
  cloneProject,
  deleteFolder,
  deleteProject,
  getAllFolders,
  getAllProjects,
  getProject,
  moveFolder,
  moveProject,
  renameFolder,
  updateProject,
} from '../db/db';
import { showToast } from '../components/Toast';
import { showWelcome } from '../components/WelcomeModal';
import { downloadBackup, restoreFromBackup } from '../utils/backup';
import type { FolderRecord, ProjectRecord } from '../types';
import { APP_VERSION, AUTHOR_NAME, AUTHOR_URL } from '../version';

export interface LibraryCallbacks {
  onNewProject: (folderId: number | null) => void;
  onOpenProject: (id: number) => void;
  onPreviewProject: (id: number) => void;
  onExportProject: (id: number) => void;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class LibraryView {
  private container: HTMLElement;
  private callbacks: LibraryCallbacks;
  private projects: ProjectRecord[] = [];
  private folders: FolderRecord[] = [];
  private currentFolderId: number | null = null;
  private searchQuery = '';
  private viewMode: 'grid' | 'list' = 'grid';
  private isLoading = true;
  private coverUrls = new Map<number, string>();
  private static STORAGE_KEY = 'epubfacil-library-view-mode';

  constructor(callbacks: LibraryCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
    this.viewMode = localStorage.getItem(LibraryView.STORAGE_KEY) === 'list' ? 'list' : 'grid';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  /** Triggers a library backup download (used from the navbar). */
  public backup() {
    void this.handleBackup();
  }

  /** Opens the restore file picker (used from the navbar). */
  public restore() {
    this.container.querySelector<HTMLInputElement>('#lib-restore-input')?.click();
  }

  destroy() {
    this.coverUrls.forEach((url) => URL.revokeObjectURL(url));
    this.coverUrls.clear();
  }

  private get currentFolders(): FolderRecord[] {
    return this.folders
      .filter((f) => (f.parentId == null ? this.currentFolderId == null : f.parentId === this.currentFolderId))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private get currentProjects(): ProjectRecord[] {
    return this.projects
      .filter((p) => (p.folderId == null ? this.currentFolderId == null : p.folderId === this.currentFolderId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private get breadcrumb(): FolderRecord[] {
    const path: FolderRecord[] = [];
    let cur = this.folders.find((f) => f.id === this.currentFolderId);
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId != null ? this.folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return path;
  }

  async load() {
    this.isLoading = true;
    this.render();
    try {
      this.folders = await getAllFolders();
      this.projects = await getAllProjects();
      if (this.currentFolderId != null && !this.folders.some((f) => f.id === this.currentFolderId)) {
        this.currentFolderId = null;
      }
      this.coverUrls.forEach((url) => URL.revokeObjectURL(url));
      this.coverUrls.clear();
      for (const project of this.currentProjects) {
        if (project.coverBlob && project.id) {
          this.coverUrls.set(project.id, URL.createObjectURL(project.coverBlob));
        }
      }
    } catch (err) {
      console.error(err);
      showToast({ message: 'No se pudo cargar la biblioteca', type: 'error' });
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private render() {
    if (this.isLoading) {
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
          <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p class="text-sm font-medium">Accediendo al almacenamiento local…</p>
        </div>`;
      return;
    }

    const folders = this.currentFolders.filter((f) =>
      f.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    const projects = this.currentProjects.filter(
      (p) =>
        p.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        p.author.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    const totalWords = this.currentProjects.reduce((sum, p) => sum + (p.wordCount || 0), 0);

    this.container.innerHTML = `
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">
              ${this.currentFolderId != null ? escapeHtml(this.breadcrumb[this.breadcrumb.length - 1]?.name ?? 'Carpeta') : 'Mi biblioteca de ePub'}
            </h1>
            <p class="mt-1 text-sm text-slate-500">
              Convierte, edita y exporta libros ePub. Todo se guarda en tu dispositivo (IndexedDB), sin servidores.
            </p>
          </div>
          <div class="hidden sm:flex items-center gap-2">
            <button id="lib-backup-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer" title="Descargar copia de seguridad">
              <svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Copia de seguridad</span>
            </button>
            <label for="lib-restore-input" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer" title="Restaurar desde una copia">
              <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <span>Restaurar copia</span>
            </label>
            <input type="file" id="lib-restore-input" accept=".zip" class="hidden" />
          </div>
        </div>

        <div class="mt-5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
              <button id="lib-new-folder-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-200 transition cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
                <span>Nueva carpeta</span>
              </button>
              <button id="lib-new-project-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-semibold transition cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                <span>Convertir documento</span>
              </button>
            </div>
            <div class="hidden sm:flex items-center gap-4 text-xs font-medium text-slate-500 px-2 shrink-0">
              <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#2563EB]"></span><span><strong class="text-slate-800 font-semibold">${totalWords.toLocaleString('es-ES')}</strong> palabras</span></div>
              <div class="h-4 w-px bg-slate-200"></div>
              <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>IndexedDB activo</span></div>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <div class="flex items-center gap-1 text-xs font-semibold text-slate-500 min-w-0 flex-wrap">
              ${
                this.currentFolderId != null
                  ? `<button data-nav="root" class="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 hover:text-[#2563EB] transition cursor-pointer">
                       <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                       <span>Biblioteca</span>
                     </button>
                     <button id="lib-up-btn" class="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer" title="Subir un nivel">
                       <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                     </button>`
                  : ''
              }
              ${this.breadcrumb
                .map(
                  (f) => `<div class="flex items-center gap-1 min-w-0"><span class="text-slate-300">/</span>
                    <button data-nav="${f.id}" class="flex items-center gap-1 px-1.5 py-1 rounded-md truncate max-w-[140px] transition cursor-pointer ${
                      f.id === this.currentFolderId ? 'text-[#2563EB] bg-blue-50 font-bold' : 'hover:bg-slate-100 hover:text-slate-900'
                    }"><svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span class="truncate">${escapeHtml(f.name)}</span></button></div>`
                )
                .join('')}
            </div>

            <div class="relative flex-1 min-w-0">
              <svg class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input id="lib-search" type="text" placeholder="Buscar en esta carpeta…" value="${escapeHtml(this.searchQuery)}" class="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 hover:bg-slate-100/80 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] rounded-lg border border-slate-200 transition-all" />
            </div>

            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
              <button id="lib-view-grid" class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${this.viewMode === 'grid' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>
              </button>
              <button id="lib-view-list" class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${this.viewMode === 'list' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      ${
        folders.length > 0
          ? `<div class="mb-8">
              <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Carpetas <span class="text-[10px] font-semibold text-slate-400">${folders.length}</span>
              </h2>
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                ${folders.map((f) => this.renderFolderCard(f)).join('')}
              </div>
            </div>`
          : ''
      }

      ${
        projects.length === 0
          ? this.renderEmptyState()
          : this.viewMode === 'list'
            ? `<div class="flex flex-col gap-4">${projects.map((p) => this.renderProjectRow(p)).join('')}</div>`
            : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">${projects.map((p) => this.renderProjectCard(p)).join('')}</div>`
      }

      <footer class="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span class="w-5 h-5 bg-[#2563EB] rounded flex items-center justify-center shrink-0">
            <div class="w-2.5 h-3 border-2 border-white rounded-xs transform -skew-x-6"></div>
          </span>
          <span>Proyecto creado por <a href="${AUTHOR_URL}" target="_blank" rel="noopener noreferrer" class="font-semibold text-[#2563EB] hover:underline">${AUTHOR_NAME}</a></span>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-slate-500">
          <span class="text-[10px] font-mono text-slate-400">v${APP_VERSION}</span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>Licencia <a href="/LICENSE" target="_blank" rel="noopener noreferrer" class="font-semibold text-slate-600 hover:underline">MIT</a></span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <button id="lib-guide-btn" class="font-semibold text-slate-600 hover:text-[#2563EB] hover:underline cursor-pointer">Guía de inicio</button>
        </div>
      </footer>
    `;

    this.bindEvents();
  }

  private renderEmptyState(): string {
    return `
      <div class="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
        <div class="w-14 h-14 mx-auto rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB] mb-4">
          <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>
        </div>
        <h2 class="text-lg font-bold text-slate-900">${this.searchQuery ? 'Sin resultados' : 'Todavía no hay libros'}</h2>
        <p class="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          ${
            this.searchQuery
              ? 'Prueba con otra palabra clave.'
              : 'Pulsa «Convertir documento» para crear tu primer ePub a partir de un PDF, Word, OpenOffice, HTML, texto o Markdown.'
          }
        </p>
      </div>`;
  }

  private renderFolderCard(folder: FolderRecord): string {
    const count = this.projects.filter((p) => p.folderId === folder.id).length;
    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col" data-folder-id="${folder.id}">
        <div class="relative aspect-4/3 bg-gradient-to-br from-blue-50 to-indigo-50/60 overflow-hidden cursor-pointer border-b border-slate-100 flex items-center justify-center text-[#2563EB]" data-folder-action="open">
          <svg class="w-14 h-14 drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <div class="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button data-folder-action="rename" title="Renombrar" class="p-1.5 rounded-md bg-white/95 hover:bg-white text-slate-600 hover:text-[#2563EB] shadow-xs cursor-pointer"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
            <button data-folder-action="delete" title="Eliminar" class="p-1.5 rounded-md bg-white/95 hover:bg-white text-slate-600 hover:text-red-600 shadow-xs cursor-pointer"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
        <div class="p-3">
          <h3 class="font-bold text-sm text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</h3>
          <p class="text-[11px] text-slate-400 mt-0.5">${count} ${count === 1 ? 'libro' : 'libros'}</p>
        </div>
      </div>`;
  }

  private renderProjectCard(project: ProjectRecord): string {
    const coverUrl = project.id ? this.coverUrls.get(project.id) : undefined;
    const date = new Date(project.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between" data-project-id="${project.id}">
        <div class="relative aspect-3/4 bg-slate-100 overflow-hidden cursor-pointer border-b border-slate-100" data-action="preview">
          ${
            coverUrl
              ? `<img src="${coverUrl}" alt="${escapeHtml(project.title)}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300" />`
              : `<div class="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50"><svg class="w-12 h-12 mb-2 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg><span class="text-xs font-medium">Sin carátula</span></div>`
          }
          <div class="absolute top-3 left-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/95 text-slate-700 shadow-xs border border-slate-200/60">${project.chapterCount} ${project.chapterCount === 1 ? 'capítulo' : 'capítulos'}</span>
          </div>
          <div class="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button class="px-4 py-2 rounded-md bg-white text-slate-900 text-xs font-bold shadow-md flex items-center gap-1.5">
              <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Previsualizar</span>
            </button>
          </div>
        </div>
        <div class="p-4 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-base text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors" title="${escapeHtml(project.title)}">${escapeHtml(project.title)}</h3>
            <div class="flex items-center gap-1.5 mt-1">
              ${project.author ? `<span class="text-[10px] font-semibold text-slate-500 truncate max-w-[160px]">${escapeHtml(project.author)}</span>` : ''}
              <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">${project.sourceKind}</span>
            </div>
            <p class="mt-1.5 text-xs text-slate-500 line-clamp-2 min-h-8 leading-relaxed">${escapeHtml(project.description || 'Sin descripción.')}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span class="font-mono text-[11px]">${date}</span>
            <div class="flex items-center gap-1">
              <button data-action="edit" title="Editar capítulos" class="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
              <button data-action="export" title="Exportar ePub" class="p-1.5 rounded text-[#2563EB] hover:bg-blue-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
              <button data-action="clone" title="Duplicar" class="p-1.5 rounded text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
              <button data-action="delete" title="Eliminar" class="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private renderProjectRow(project: ProjectRecord): string {
    const coverUrl = project.id ? this.coverUrls.get(project.id) : undefined;
    const date = new Date(project.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all" data-project-id="${project.id}">
        <div class="flex flex-row">
          <div class="relative w-24 sm:w-28 shrink-0 h-36 bg-slate-100 overflow-hidden cursor-pointer border-r border-slate-100" data-action="preview">
            ${
              coverUrl
                ? `<img src="${coverUrl}" alt="${escapeHtml(project.title)}" class="w-full h-full object-cover" />`
                : `<div class="w-full h-full flex items-center justify-center text-slate-300"><svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg></div>`
            }
          </div>
          <div class="p-4 flex-1 flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-base text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors">${escapeHtml(project.title)}</h3>
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-slate-500">
                ${project.author ? `<span class="font-semibold truncate max-w-[160px]">${escapeHtml(project.author)}</span>` : ''}
                <span class="px-1.5 py-0.5 rounded bg-slate-100 uppercase">${project.sourceKind}</span>
                <span>${project.chapterCount} ${project.chapterCount === 1 ? 'capítulo' : 'capítulos'}</span>
                <span>${(project.wordCount || 0).toLocaleString('es-ES')} palabras</span>
              </div>
              <p class="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed max-w-2xl">${escapeHtml(project.description || 'Sin descripción.')}</p>
              <span class="mt-2 inline-block font-mono text-[11px] text-slate-400">${date}</span>
            </div>
            <div class="flex items-center gap-1 sm:shrink-0 sm:border-l sm:border-slate-100 sm:pl-4">
              <button data-action="edit" class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg><span class="hidden sm:inline">Editar</span></button>
              <button data-action="export" title="Exportar ePub" class="p-2 rounded-lg text-[#2563EB] hover:bg-blue-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
              <button data-action="clone" title="Duplicar" class="p-2 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
              <button data-action="delete" title="Eliminar" class="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private bindEvents() {
    this.container.querySelector('#lib-guide-btn')?.addEventListener('click', () => showWelcome());
    this.container.querySelector('#lib-new-folder-btn')?.addEventListener('click', () => this.openFolderModal());
    this.container.querySelector('#lib-new-project-btn')?.addEventListener('click', () => this.callbacks.onNewProject(this.currentFolderId));
    this.container.querySelector('#lib-up-btn')?.addEventListener('click', () => {
      const parent = this.folders.find((f) => f.id === this.currentFolderId)?.parentId ?? null;
      this.currentFolderId = parent;
      this.load();
    });
    this.container.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      const val = el.getAttribute('data-nav');
      el.addEventListener('click', () => {
        this.currentFolderId = val === 'root' ? null : Number(val);
        this.load();
      });
    });

    const search = this.container.querySelector<HTMLInputElement>('#lib-search');
    if (search) {
      search.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.render();
        const next = this.container.querySelector<HTMLInputElement>('#lib-search');
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      });
    }

    this.container.querySelector('#lib-view-grid')?.addEventListener('click', () => this.setViewMode('grid'));
    this.container.querySelector('#lib-view-list')?.addEventListener('click', () => this.setViewMode('list'));
    this.container.querySelector('#lib-backup-btn')?.addEventListener('click', () => this.handleBackup());
    const restore = this.container.querySelector<HTMLInputElement>('#lib-restore-input');
    if (restore) {
      restore.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.handleRestore(file);
        restore.value = '';
      });
    }

    this.container.querySelectorAll<HTMLElement>('[data-folder-id]').forEach((card) => {
      const folderId = Number(card.getAttribute('data-folder-id'));
      card.querySelectorAll<HTMLElement>('[data-folder-action]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = el.getAttribute('data-folder-action');
          const folder = this.folders.find((f) => f.id === folderId);
          if (!folder) return;
          if (action === 'open') {
            this.currentFolderId = folderId;
            this.load();
          } else if (action === 'rename') {
            this.openFolderModal(folder);
          } else if (action === 'delete') {
            this.handleDeleteFolder(folder);
          }
        });
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-project-id]').forEach((card) => {
      const id = Number(card.getAttribute('data-project-id'));
      card.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = el.getAttribute('data-action');
          if (action === 'preview') this.callbacks.onPreviewProject(id);
          else if (action === 'edit') this.callbacks.onOpenProject(id);
          else if (action === 'export') this.callbacks.onExportProject(id);
          else if (action === 'clone') this.handleClone(id);
          else if (action === 'delete') this.handleDelete(id);
        });
      });
    });
  }

  private setViewMode(mode: 'grid' | 'list') {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    localStorage.setItem(LibraryView.STORAGE_KEY, mode);
    this.render();
  }

  private async handleBackup() {
    try {
      showToast({ message: 'Generando copia de seguridad…', type: 'info' });
      await downloadBackup();
      showToast({ message: 'Copia de seguridad descargada.', type: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al crear la copia de seguridad', type: 'error' });
    }
  }

  private async handleRestore(file: File) {
    try {
      showToast({ message: 'Restaurando copia…', type: 'info' });
      const { projects, chapters } = await restoreFromBackup(file);
      showToast({ message: `Restaurados ${projects} libros y ${chapters} capítulos.`, type: 'success' });
      await this.load();
    } catch (err) {
      console.error(err);
      showToast({ message: (err as Error).message || 'Error al restaurar la copia', type: 'error' });
    }
  }

  private async handleClone(id: number) {
    try {
      await cloneProject(id);
      showToast({ message: 'Libro duplicado.', type: 'success' });
      await this.load();
    } catch (err) {
      showToast({ message: 'Error al duplicar el libro', type: 'error' });
    }
  }

  private handleDelete(id: number) {
    const project = this.projects.find((p) => p.id === id);
    if (!project) return;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-3 text-red-600">
          <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
          <h3 class="text-base font-bold text-slate-900">Eliminar libro</h3>
        </div>
        <p class="text-sm text-slate-600 mt-2">¿Eliminar permanentemente <strong>"${escapeHtml(project.title)}"</strong> y todos sus capítulos e imágenes?</p>
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="del-cancel" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
          <button id="del-confirm" class="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition cursor-pointer">Eliminar</button>
        </div>
      </div>`;
    modal.querySelector('#del-cancel')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#del-confirm')?.addEventListener('click', async () => {
      document.body.removeChild(modal);
      await deleteProject(id);
      showToast({ message: 'Libro eliminado.', type: 'success' });
      await this.load();
    });
    document.body.appendChild(modal);
  }

  private handleDeleteFolder(folder: FolderRecord) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <h3 class="text-base font-bold text-slate-900">Eliminar carpeta</h3>
        <p class="text-sm text-slate-600 mt-2">¿Eliminar la carpeta <strong>"${escapeHtml(folder.name)}"</strong>? Los libros que contiene se moverán a la carpeta superior.</p>
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="df-cancel" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
          <button id="df-confirm" class="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition cursor-pointer">Eliminar</button>
        </div>
      </div>`;
    modal.querySelector('#df-cancel')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#df-confirm')?.addEventListener('click', async () => {
      document.body.removeChild(modal);
      await deleteFolder(folder.id!);
      showToast({ message: 'Carpeta eliminada.', type: 'success' });
      await this.load();
    });
    document.body.appendChild(modal);
  }

  private openFolderModal(existing?: FolderRecord) {
    const isEdit = !!existing;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <h3 class="text-base font-bold text-slate-900 mb-4">${isEdit ? 'Renombrar carpeta' : 'Nueva carpeta'}</h3>
        <input id="folder-input" type="text" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Nombre de la carpeta…" class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition" />
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="folder-cancel" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
          <button id="folder-confirm" class="px-4 py-2 text-xs font-semibold rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white transition cursor-pointer">${isEdit ? 'Guardar' : 'Crear'}</button>
        </div>
      </div>`;
    const input = modal.querySelector<HTMLInputElement>('#folder-input')!;
    input.focus();
    input.select();
    modal.querySelector('#folder-cancel')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#folder-confirm')?.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) {
        showToast({ message: 'Introduce un nombre.', type: 'warning' });
        return;
      }
      document.body.removeChild(modal);
      if (isEdit && existing) await renameFolder(existing.id!, name);
      else await addFolder(name, this.currentFolderId);
      await this.load();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector<HTMLElement>('#folder-confirm')?.click();
    });
    document.body.appendChild(modal);
  }
}
