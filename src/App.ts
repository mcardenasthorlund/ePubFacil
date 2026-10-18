import { Navbar } from './components/Navbar';
import { showToast } from './components/Toast';
import { showWelcomeIfNeeded, showWelcome } from './components/WelcomeModal';
import { getAllProjects } from './db/db';
import { initPWA, onUpdateAvailable } from './pwa';
import { seedSampleProject } from './utils/sample';
import { ChaptersView } from './views/ChaptersView';
import { ConvertView } from './views/ConvertView';
import { ExportView } from './views/ExportView';
import { LibraryView } from './views/LibraryView';
import { MetaCoverView } from './views/MetaCoverView';
import { PreviewView } from './views/PreviewView';
import type { AppView } from './types';

export class EpubFacilApp {
  private container: HTMLElement;
  private currentView: AppView = 'library';
  private activeProjectId?: number;
  private pendingFolderId: number | null = null;

  private navbar: Navbar;
  private libraryView: LibraryView;
  private convertView: ConvertView;
  private chaptersView: ChaptersView;
  private metaView: MetaCoverView;
  private exportView: ExportView;
  private previewView: PreviewView;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.className = 'min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans';

    initPWA();
    showWelcomeIfNeeded();

    onUpdateAvailable((reload) => {
      showToast({
        message: '¡Nueva versión de ePubFacil disponible!',
        type: 'info',
        duration: 0,
        action: { label: 'Actualizar', onClick: reload },
      });
    });

    this.navbar = new Navbar({
      onNavigate: (view) => {
        if (view === 'library') {
          this.activeProjectId = undefined;
          this.setView('library');
        }
      },
      onNewProject: () => {
        this.activeProjectId = undefined;
        this.pendingFolderId = null;
        this.setView('convert');
      },
      onSampleProject: () => this.createSample(),
      onBackup: () => this.libraryView.backup(),
      onRestore: () => this.libraryView.restore(),
      onGuide: () => showWelcome(),
    });

    this.libraryView = new LibraryView({
      onNewProject: (folderId) => {
        this.activeProjectId = undefined;
        this.pendingFolderId = folderId ?? null;
        this.setView('convert');
      },
      onOpenProject: (id) => this.setView('chapters', id),
      onPreviewProject: (id) => this.setView('preview', id),
      onExportProject: (id) => this.setView('export', id),
    });

    this.convertView = new ConvertView({
      onConverted: (projectId) => {
        if (projectId) this.setView('chapters', projectId);
        else this.setView('library');
      },
      onCancel: () => this.setView('library'),
    });

    this.chaptersView = new ChaptersView({
      onBack: () => this.setView('library'),
      onNavigate: (view, id) => this.setView(view, id),
      onPreview: (id) => this.setView('preview', id),
    });

    this.metaView = new MetaCoverView({
      onBack: () => this.setView('library'),
      onNavigate: (view, id) => this.setView(view, id),
    });

    this.exportView = new ExportView({
      onBack: () => this.setView('library'),
      onNavigate: (view, id) => this.setView(view, id),
      onPreview: (id) => this.setView('preview', id),
    });

    this.previewView = new PreviewView({
      onBack: () => this.setView('library'),
      onEdit: (id) => this.setView('chapters', id),
      onExport: (id) => this.setView('export', id),
    });

    // Seed a sample project on first use so the app never looks empty.
    getAllProjects().then(async (projects) => {
      if (projects.length === 0) {
        try {
          await seedSampleProject(null);
        } catch (e) {
          console.warn('Sample seed skipped:', e);
        }
      }
      if (this.currentView === 'library') this.libraryView.load();
    });

    this.renderView();
  }

  private async flushCurrentView(): Promise<void> {
    try {
      if (this.currentView === 'chapters') await this.chaptersView.flush();
      else if (this.currentView === 'meta') await this.metaView.flush();
    } catch (err) {
      console.warn('No se pudo completar el guardado antes de salir:', err);
    }
  }

  public async setView(view: AppView, projectId?: number) {
    if (view !== this.currentView) {
      await this.flushCurrentView();
    }
    this.currentView = view;
    if (projectId !== undefined) this.activeProjectId = projectId;
    this.renderView();
  }

  private async createSample() {
    try {
      showToast({ message: 'Generando libro de ejemplo…', type: 'info' });
      await seedSampleProject(null);
      showToast({ message: '¡Libro de ejemplo creado!', type: 'success' });
      if (this.currentView === 'library') this.libraryView.load();
      else this.setView('library');
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al generar el libro de ejemplo', type: 'error' });
    }
  }

  private renderView() {
    this.container.innerHTML = '';
    this.navbar.setView(this.currentView);

    if (this.currentView === 'preview') {
      if (!this.activeProjectId) {
        this.setView('library');
        return;
      }
      this.container.appendChild(this.navbar.getElement());
      this.container.appendChild(this.previewView.getElement());
      this.previewView.load(this.activeProjectId);
      return;
    }

    this.container.appendChild(this.navbar.getElement());

    switch (this.currentView) {
      case 'library':
        this.container.appendChild(this.libraryView.getElement());
        this.libraryView.load();
        break;
      case 'convert':
        this.container.appendChild(this.convertView.getElement());
        this.convertView.load();
        break;
      case 'chapters':
        if (this.activeProjectId) {
          this.container.appendChild(this.chaptersView.getElement());
          this.chaptersView.load(this.activeProjectId);
        } else this.setView('library');
        break;
      case 'meta':
        if (this.activeProjectId) {
          this.container.appendChild(this.metaView.getElement());
          this.metaView.load(this.activeProjectId);
        } else this.setView('library');
        break;
      case 'export':
        if (this.activeProjectId) {
          this.container.appendChild(this.exportView.getElement());
          this.exportView.load(this.activeProjectId);
        } else this.setView('library');
        break;
    }
  }

  public destroy() {
    this.libraryView.destroy();
    this.chaptersView.destroy();
    this.metaView.destroy();
    this.previewView.destroy();
  }
}
