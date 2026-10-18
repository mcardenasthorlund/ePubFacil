import { openAssetPicker, type EditorAssets, type EditorImage } from './AssetPicker';
import { sanitizeHtml } from '../convert/toChapters';
import { optimizeImageBlob } from '../utils/imageOptim';

export interface RichTextEditorOptions {
  initialHtml: string;
  assets: EditorAssets;
  onChange?: () => void;
}

const ICONS: Record<string, string> = {
  paragraph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M13 4v16"></path><path d="M17 4v16"></path><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"></path></svg>',
  h1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M4 6v12"></path><path d="M12 6v12"></path><path d="M4 12h8"></path><path d="M17 18V9l-2 1.5"></path></svg>',
  h2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M4 6v12"></path><path d="M12 6v12"></path><path d="M4 12h8"></path><path d="M15 9a3 3 0 1 1 4.8 2.4L15 18h5"></path></svg>',
  h3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M4 6v12"></path><path d="M12 6v12"></path><path d="M4 12h8"></path><path d="M15 8h4l-2.5 3a2.5 2.5 0 1 1-2 4"></path></svg>',
  bold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M6 4h8a4 4 0 0 1 0 8H6z"></path><path d="M6 12h9a4 4 0 0 1 0 8H6z"></path></svg>',
  italic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>',
  underline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M6 4v6a6 6 0 0 0 12 0V4"></path><line x1="4" y1="20" x2="20" y2="20"></line></svg>',
  strike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M6 4h12"></path><path d="M6 20h12"></path><line x1="4" y1="12" x2="20" y2="12"></line></svg>',
  ul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="5" cy="6" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="18" r="1"></circle></svg>',
  ol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><line x1="10" y1="6" x2="20" y2="6"></line><line x1="10" y1="12" x2="20" y2="12"></line><line x1="10" y1="18" x2="20" y2="18"></line><path d="M4 6h1v3"></path><path d="M4 15h2v1H4v2h2"></path></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M7 7H4v6h3l-2 4h3l2-4V7z"></path><path d="M17 7h-3v6h3l-2 4h3l2-4V7z"></path></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"></path><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"></path></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M3 7v6h6"></path><path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M21 7v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="m7 21-4-4a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 21z"></path><path d="M22 21H7"></path></svg>',
};

interface ToolButton {
  icon: string;
  title: string;
  command?: string;
  value?: string;
  action?: () => void;
  name?: string;
  separator?: boolean;
}

export class RichTextEditor {
  private container: HTMLElement;
  private area: HTMLElement;
  private inspector: HTMLElement;
  private opts: RichTextEditorOptions;
  private urlToFile = new Map<string, string>();
  private currentImage: HTMLImageElement | null = null;
  private currentCell: HTMLElement | null = null;

  constructor(options: RichTextEditorOptions) {
    this.opts = options;
    this.container = document.createElement('div');
    this.container.className = 'ef-editor flex flex-col';

    this.area = document.createElement('div');
    this.area.className = 'ef-editor-area epub-preview bg-white rounded-xl border border-slate-200 p-5 sm:p-6';
    this.area.contentEditable = 'true';
    this.area.spellcheck = true;
    this.area.innerHTML = this.toEditorHtml(options.initialHtml);

    this.inspector = document.createElement('div');
    this.inspector.className =
      'fixed z-[70] hidden rounded-xl border border-slate-200 bg-white shadow-xl';
    this.inspector.style.maxWidth = '92vw';

    const toolbar = this.buildToolbar();
    this.container.appendChild(toolbar);
    this.container.appendChild(this.area);
    document.body.appendChild(this.inspector);

    this.bindAreaEvents();
  }

  getElement(): HTMLElement {
    return this.container;
  }

  destroy() {
    if (this.inspector.parentElement) this.inspector.parentElement.removeChild(this.inspector);
  }

  getWordCount(): number {
    return (this.area.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  }

  /** Sets content from stored HTML (images/… references). */
  setHtml(html: string) {
    this.area.innerHTML = this.toEditorHtml(html);
  }

  /** Returns stored HTML (images/… references), without editor-only classes. */
  getHtml(): string {
    const clone = this.area.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.ef-selected, .ef-selected-cell').forEach((el) => {
      el.classList.remove('ef-selected', 'ef-selected-cell');
      if (!el.getAttribute('class')) el.removeAttribute('class');
    });
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    const html = clone.innerHTML.replace(
      /src=("|')(blob:[^"']+)\1/g,
      (match, quote: string, url: string) => {
        const file = this.urlToFile.get(url);
        return file ? `src=${quote}images/${file}${quote}` : match;
      }
    );
    return html;
  }

  // ---- HTML <-> editor conversion -----------------------------------------

  private toEditorHtml(html: string): string {
    return html.replace(/src=("|')images\/([^"']+)\1/g, (match, quote: string, file: string) => {
      const url = this.opts.assets.getUrl(file);
      if (!url) return match;
      this.urlToFile.set(url, file);
      return `src=${quote}${url}${quote}`;
    });
  }

  // ---- Toolbar -------------------------------------------------------------

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className =
      'sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-1.5';

    const buttons: ToolButton[] = [
      { name: 'paragraph', icon: ICONS.paragraph, title: 'Párrafo', command: 'formatBlock', value: 'P' },
      { name: 'h1', icon: ICONS.h1, title: 'Título 1', command: 'formatBlock', value: 'H1' },
      { name: 'h2', icon: ICONS.h2, title: 'Título 2', command: 'formatBlock', value: 'H2' },
      { name: 'h3', icon: ICONS.h3, title: 'Título 3', command: 'formatBlock', value: 'H3' },
      { separator: true, icon: '', title: '' },
      { name: 'bold', icon: ICONS.bold, title: 'Negrita (Ctrl+B)', command: 'bold' },
      { name: 'italic', icon: ICONS.italic, title: 'Cursiva (Ctrl+I)', command: 'italic' },
      { name: 'underline', icon: ICONS.underline, title: 'Subrayado (Ctrl+U)', command: 'underline' },
      { name: 'strike', icon: ICONS.strike, title: 'Tachado', command: 'strikeThrough' },
      { separator: true, icon: '', title: '' },
      { name: 'ul', icon: ICONS.ul, title: 'Lista con viñetas', command: 'insertUnorderedList' },
      { name: 'ol', icon: ICONS.ol, title: 'Lista numerada', command: 'insertOrderedList' },
      { name: 'quote', icon: ICONS.quote, title: 'Cita', command: 'formatBlock', value: 'BLOCKQUOTE' },
      { name: 'link', icon: ICONS.link, title: 'Enlace', action: () => this.insertLink() },
      { separator: true, icon: '', title: '' },
      { name: 'image', icon: ICONS.image, title: 'Insertar imagen', action: () => void this.insertImage() },
      { name: 'table', icon: ICONS.table, title: 'Insertar tabla', action: () => this.openTableDialog() },
      { separator: true, icon: '', title: '' },
      { name: 'undo', icon: ICONS.undo, title: 'Deshacer', command: 'undo' },
      { name: 'redo', icon: ICONS.redo, title: 'Rehacer', command: 'redo' },
      { name: 'eraser', icon: ICONS.eraser, title: 'Quitar formato', command: 'removeFormat' },
    ];

    for (const b of buttons) {
      if (b.separator) {
        const sep = document.createElement('span');
        sep.className = 'w-px h-6 bg-slate-200 mx-1 shrink-0';
        toolbar.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = b.title;
      btn.className = 'ef-toolbar-btn';
      btn.innerHTML = b.icon;
      if (b.name) btn.dataset.name = b.name;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        if (b.action) {
          b.action();
        } else if (b.command) {
          this.exec(b.command, b.value);
          this.refreshToolbarState();
        }
      });
      toolbar.appendChild(btn);
    }

    return toolbar;
  }

  private refreshToolbarState() {
    const state: Record<string, boolean> = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
    };
    this.container.querySelectorAll<HTMLElement>('.ef-toolbar-btn').forEach((btn) => {
      const name = btn.dataset.name;
      if (name && name in state) btn.classList.toggle('is-active', state[name]);
    });
  }

  private exec(command: string, value?: string) {
    this.area.focus();
    document.execCommand(command, false, value);
    this.notifyChange();
  }

  private insertHtml(html: string) {
    this.area.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !this.area.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(this.area);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    document.execCommand('insertHTML', false, html);
    this.notifyChange();
  }

  private notifyChange() {
    this.opts.onChange?.();
  }

  // ---- Links ---------------------------------------------------------------

  private insertLink() {
    const url = window.prompt('Dirección del enlace (https://…):', 'https://');
    if (!url) return;
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean) && !/^mailto:/i.test(clean)) return;
    this.exec('createLink', clean);
  }

  // ---- Images --------------------------------------------------------------

  private async insertImage() {
    const picked = await openAssetPicker(this.opts.assets);
    if (picked) this.registerImage(picked);
  }

  private registerImage(image: EditorImage) {
    this.urlToFile.set(image.url, image.fileName);
    this.insertHtml(
      `<img src="${image.url}" alt="" class="ef-img-lg ef-align-center">`
    );
  }

  private async insertImageFromBlob(blob: Blob, mime: string) {
    const optimized = await optimizeImageBlob(blob, 1600);
    const created = await this.opts.assets.add(optimized.blob, optimized.blob.type || mime);
    this.registerImage(created);
  }

  // ---- Tables --------------------------------------------------------------

  private openTableDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4';
    overlay.innerHTML = `
      <div class="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <h3 class="text-base font-bold text-slate-900 mb-4">Insertar tabla</h3>
        <div class="flex items-center gap-3">
          <label class="flex-1">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Filas</span>
            <input id="tb-rows" type="number" min="1" max="20" value="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden" />
          </label>
          <label class="flex-1">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Columnas</span>
            <input id="tb-cols" type="number" min="1" max="10" value="2" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden" />
          </label>
        </div>
        <label class="mt-4 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input id="tb-header" type="checkbox" checked class="rounded text-[#2563EB] focus:ring-[#2563EB]" />
          Fila de encabezado
        </label>
        <div class="mt-5 flex items-center justify-end gap-2.5">
          <button id="tb-cancel" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button id="tb-ok" class="px-4 py-2 text-xs font-semibold rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white cursor-pointer">Insertar</button>
        </div>
      </div>`;
    const close = () => document.body.removeChild(overlay);
    overlay.querySelector('#tb-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#tb-ok')?.addEventListener('click', () => {
      const rows = Math.max(1, Math.min(20, Number((overlay.querySelector('#tb-rows') as HTMLInputElement).value) || 1));
      const cols = Math.max(1, Math.min(10, Number((overlay.querySelector('#tb-cols') as HTMLInputElement).value) || 1));
      const header = (overlay.querySelector('#tb-header') as HTMLInputElement).checked;
      close();
      this.insertTable(rows, cols, header);
    });
    document.body.appendChild(overlay);
  }

  private insertTable(rows: number, cols: number, header: boolean) {
    let html = '<table class="ef-table"><tbody>';
    for (let r = 0; r < rows; r++) {
      const tag = header && r === 0 ? 'th' : 'td';
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += `<${tag}><br></${tag}>`;
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    this.insertHtml(html);
  }

  // ---- Area events ---------------------------------------------------------

  private bindAreaEvents() {
    this.area.addEventListener('input', () => {
      this.notifyChange();
      this.refreshToolbarState();
    });
    this.area.addEventListener('keyup', () => this.refreshToolbarState());
    this.area.addEventListener('mouseup', () => this.refreshToolbarState());

    this.area.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const img = target.closest('img') as HTMLImageElement | null;
      const cell = target.closest('td, th') as HTMLElement | null;
      this.clearMarks();
      if (img && this.area.contains(img)) {
        this.selectImage(img);
      } else if (cell && this.area.contains(cell)) {
        this.selectCell(cell);
      } else {
        this.hideInspector();
      }
    });

    this.area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideInspector();
    });

    this.area.addEventListener('paste', (e) => this.handlePaste(e));
    this.area.addEventListener('dragover', (e) => e.preventDefault());
    this.area.addEventListener('drop', (e) => this.handleDrop(e));
    document.addEventListener('scroll', () => this.hideInspector(), true);
    window.addEventListener('resize', () => this.hideInspector());
  }

  private handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            void this.insertImageFromBlob(file, file.type);
            return;
          }
        }
      }
    }
    const html = e.clipboardData?.getData('text/html');
    if (html) {
      const clean = sanitizeHtml(html);
      this.insertHtml(clean || this.escapeText(e.clipboardData?.getData('text/plain') ?? ''));
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text) this.insertHtml(this.escapeText(text).replace(/\n/g, '<br>'));
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          void this.insertImageFromBlob(file, file.type);
          return;
        }
      }
    }
  }

  private escapeText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Selection marks & inspectors ---------------------------------------

  private clearMarks() {
    this.area.querySelectorAll('.ef-selected, .ef-selected-cell').forEach((el) => {
      el.classList.remove('ef-selected', 'ef-selected-cell');
    });
  }

  private selectImage(img: HTMLImageElement) {
    this.currentCell = null;
    this.currentImage = img;
    (img.parentElement?.tagName === 'FIGURE' ? img.parentElement : img).classList.add('ef-selected');
    this.showImageInspector(img);
  }

  private selectCell(cell: HTMLElement) {
    this.currentImage = null;
    this.currentCell = cell;
    cell.classList.add('ef-selected-cell');
    this.showTableInspector(cell);
  }

  private positionInspector(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    this.inspector.classList.remove('hidden');
    const width = this.inspector.offsetWidth || 360;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, rect.top - 52);
    this.inspector.style.left = `${left}px`;
    this.inspector.style.top = `${top}px`;
  }

  private hideInspector() {
    this.inspector.classList.add('hidden');
    this.clearMarks();
    this.currentImage = null;
    this.currentCell = null;
  }

  private showImageInspector(img: HTMLImageElement) {
    const align = this.alignClass(img);
    const size = ['ef-img-sm', 'ef-img-md', 'ef-img-lg', 'ef-img-full'].find((c) => img.classList.contains(c)) ?? 'ef-img-lg';
    const inFigure = img.parentElement?.tagName === 'FIGURE';

    this.inspector.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 p-2">
        <input id="efi-alt" type="text" value="${this.attr(img.getAttribute('alt') ?? '')}" placeholder="Texto alternativo" class="w-40 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden" />
        <select id="efi-size" class="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-hidden">
          <option value="ef-img-sm" ${size === 'ef-img-sm' ? 'selected' : ''}>Pequeña</option>
          <option value="ef-img-md" ${size === 'ef-img-md' ? 'selected' : ''}>Mediana</option>
          <option value="ef-img-lg" ${size === 'ef-img-lg' ? 'selected' : ''}>Grande</option>
          <option value="ef-img-full" ${size === 'ef-img-full' ? 'selected' : ''}>Ancho completo</option>
        </select>
        <div class="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5">
          ${this.alignBtn('left', align === 'ef-align-left')}
          ${this.alignBtn('center', align === 'ef-align-center')}
          ${this.alignBtn('right', align === 'ef-align-right')}
        </div>
        <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <input id="efi-caption" type="checkbox" ${inFigure ? 'checked' : ''} class="rounded text-[#2563EB] focus:ring-[#2563EB]" />
          Pie de foto
        </label>
        <button id="efi-delete" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer">Eliminar</button>
      </div>`;

    this.inspector.querySelector('#efi-alt')?.addEventListener('input', (e) => {
      img.setAttribute('alt', (e.target as HTMLInputElement).value);
      this.notifyChange();
    });
    this.inspector.querySelector('#efi-size')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      ['ef-img-sm', 'ef-img-md', 'ef-img-lg', 'ef-img-full'].forEach((c) => img.classList.remove(c));
      img.classList.add(value);
      this.notifyChange();
    });
    this.inspector.querySelectorAll<HTMLElement>('[data-align]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setAlign(img, btn.getAttribute('data-align') as 'left' | 'center' | 'right');
        this.selectImage(img);
      });
    });
    this.inspector.querySelector('#efi-caption')?.addEventListener('change', (e) => {
      this.setCaption(img, (e.target as HTMLInputElement).checked);
    });
    this.inspector.querySelector('#efi-delete')?.addEventListener('click', () => {
      const parent = img.parentElement;
      if (parent?.tagName === 'FIGURE') parent.remove();
      else img.remove();
      this.hideInspector();
      this.notifyChange();
    });

    this.positionInspector(img.parentElement?.tagName === 'FIGURE' ? (img.parentElement as HTMLElement) : img);
  }

  private alignBtn(dir: 'left' | 'center' | 'right', active: boolean): string {
    const paths: Record<string, string> = {
      left: '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="14" y2="12"></line><line x1="3" y1="18" x2="18" y2="18"></line>',
      center: '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="6" y1="12" x2="18" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line>',
      right: '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="6" y1="18" x2="21" y2="18"></line>',
    };
    return `<button data-align="${dir}" title="Alinear ${dir}" class="p-1 rounded ${active ? 'bg-blue-50 text-[#2563EB]' : 'text-slate-500 hover:bg-slate-100'} cursor-pointer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">${paths[dir]}</svg></button>`;
  }

  private alignClass(img: HTMLImageElement): string {
    return ['ef-align-left', 'ef-align-center', 'ef-align-right'].find((c) => img.classList.contains(c)) ?? 'ef-align-center';
  }

  private setAlign(img: HTMLImageElement, dir: 'left' | 'center' | 'right') {
    const cls = `ef-align-${dir}`;
    ['ef-align-left', 'ef-align-center', 'ef-align-right'].forEach((c) => {
      img.classList.remove(c);
      img.parentElement?.classList.remove(c);
    });
    img.classList.add(cls);
    if (img.parentElement?.tagName === 'FIGURE') img.parentElement.classList.add(cls);
    this.notifyChange();
  }

  private setCaption(img: HTMLImageElement, on: boolean) {
    const parent = img.parentElement;
    const inFigure = parent?.tagName === 'FIGURE';
    if (on && !inFigure && parent) {
      const figure = document.createElement('figure');
      ['ef-align-left', 'ef-align-center', 'ef-align-right'].forEach((c) => {
        if (img.classList.contains(c)) figure.classList.add(c);
      });
      parent.insertBefore(figure, img);
      figure.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent = 'Escribe el pie de foto…';
      figure.appendChild(cap);
    } else if (!on && inFigure && parent) {
      const figure = parent as HTMLElement;
      figure.querySelector('figcaption')?.remove();
      figure.parentElement?.insertBefore(img, figure);
      figure.remove();
    }
    this.notifyChange();
    this.selectImage(img);
  }

  private showTableInspector(cell: HTMLElement) {
    this.inspector.innerHTML = `
      <div class="flex flex-wrap items-center gap-1 p-2 text-xs">
        <button data-t="row-after" class="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">+ Fila</button>
        <button data-t="row-del" class="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">− Fila</button>
        <span class="w-px h-5 bg-slate-200 mx-1"></span>
        <button data-t="col-after" class="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">+ Columna</button>
        <button data-t="col-del" class="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">− Columna</button>
        <span class="w-px h-5 bg-slate-200 mx-1"></span>
        <button data-t="header" class="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">Encabezado</button>
        <button data-t="del" class="px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer">Eliminar tabla</button>
      </div>`;

    this.inspector.querySelectorAll<HTMLElement>('[data-t]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.getAttribute('data-t');
        if (op === 'row-after') this.addRow(cell, false);
        else if (op === 'row-del') this.deleteRow(cell);
        else if (op === 'col-after') this.addColumn(cell);
        else if (op === 'col-del') this.deleteColumn(cell);
        else if (op === 'header') this.toggleHeader(cell);
        else if (op === 'del') this.deleteTable(cell);
      });
    });

    this.positionInspector(cell);
  }

  private tableOf(cell: HTMLElement): HTMLTableElement | null {
    return cell.closest('table') as HTMLTableElement | null;
  }

  private addRow(cell: HTMLElement, before: boolean) {
    const table = this.tableOf(cell);
    const row = cell.closest('tr');
    if (!table || !row) return;
    const newRow = row.cloneNode(true) as HTMLTableRowElement;
    newRow.querySelectorAll('th').forEach((th) => {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      th.replaceWith(td);
    });
    newRow.querySelectorAll('td').forEach((td) => (td.innerHTML = '<br>'));
    if (before) row.before(newRow);
    else row.after(newRow);
    this.notifyChange();
    this.selectCell(newRow.querySelector('td') as HTMLElement);
  }

  private deleteRow(cell: HTMLElement) {
    const table = this.tableOf(cell);
    const row = cell.closest('tr');
    if (!table || !row) return;
    const rows = table.querySelectorAll('tr');
    if (rows.length <= 1) {
      this.deleteTable(cell);
      return;
    }
    row.remove();
    this.notifyChange();
    const nextCell = table.querySelector('td, th') as HTMLElement | null;
    if (nextCell) this.selectCell(nextCell);
    else this.hideInspector();
  }

  private addColumn(cell: HTMLElement) {
    const row = cell.closest('tr');
    if (!row) return;
    const index = Array.from(row.children).indexOf(cell);
    const table = this.tableOf(cell);
    if (!table) return;
    table.querySelectorAll('tr').forEach((tr) => {
      const ref = tr.children[index] as HTMLElement | undefined;
      const isHeader = ref?.tagName === 'TH';
      const newCell = document.createElement(isHeader ? 'th' : 'td');
      newCell.innerHTML = '<br>';
      if (ref) ref.after(newCell);
      else tr.appendChild(newCell);
    });
    this.notifyChange();
  }

  private deleteColumn(cell: HTMLElement) {
    const row = cell.closest('tr');
    const table = this.tableOf(cell);
    if (!row || !table) return;
    const index = Array.from(row.children).indexOf(cell);
    if (row.children.length <= 1) {
      this.deleteTable(cell);
      return;
    }
    table.querySelectorAll('tr').forEach((tr) => {
      (tr.children[index] as HTMLElement | undefined)?.remove();
    });
    this.notifyChange();
  }

  private toggleHeader(cell: HTMLElement) {
    const table = this.tableOf(cell);
    const firstRow = table?.querySelector('tr');
    if (!firstRow) return;
    const cells = Array.from(firstRow.children) as HTMLElement[];
    const allHeader = cells.every((c) => c.tagName === 'TH');
    cells.forEach((c) => {
      const repl = document.createElement(allHeader ? 'td' : 'th');
      repl.innerHTML = c.innerHTML;
      c.replaceWith(repl);
    });
    this.notifyChange();
    this.selectCell(firstRow.children[0] as HTMLElement);
  }

  private deleteTable(cell: HTMLElement) {
    this.tableOf(cell)?.remove();
    this.hideInspector();
    this.notifyChange();
  }

  private attr(value: string): string {
    return value.replace(/"/g, '&quot;');
  }
}
