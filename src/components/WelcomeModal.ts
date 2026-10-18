const STORAGE_KEY = 'epubfacil-welcome-dismissed';

interface WelcomeSlide {
  icon: string;
  title: string;
  description: string;
}

const SLIDES: WelcomeSlide[] = [
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path><path d="M6 14h6"></path></svg>`,
    title: 'Bienvenido a ePubFacil',
    description:
      'Una aplicación web (PWA) que convierte tus documentos en libros ePub con carátula, índice e imágenes. Todo el proceso ocurre en tu dispositivo, sin servidores ni subidas a la nube.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    title: 'Formatos compatibles',
    description:
      'Importa PDF, documentos de Word (.docx), OpenOffice/LibreOffice (.odt), HTML, texto plano (.txt) y Markdown. Los PDF se convierten a texto reflowable o, si lo prefieres, a páginas de imagen.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="9" y1="10" x2="9" y2="20"></line></svg>`,
    title: 'Editor de capítulos',
    description:
      'Tras la conversión se detectan los capítulos automáticamente a partir de títulos y encabezados. Puedes renombrarlos, reordenarlos, fusionarlos, dividirlos o excluirlos antes de exportar.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6h20v12H2z"></path><path d="M2 6l10 7 10-7"></path></svg>`,
    title: 'Carátula e índice',
    description:
      'Diseña una carátula generada automáticamente, sube tu propia imagen o usa la primera página del PDF. ePubFacil construye el índice (TOC) y los metadatos del libro.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>`,
    title: 'Exporta ePub 3 o ePub 2',
    description:
      'Genera ePub 3 (recomendado) con opción a ePub 2 para lectores antiguos, y variante Kepub para Kobo. Puedes convertir varios documentos a la vez o fusionarlos en un único libro.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    title: 'Cómo empezar',
    description:
      'Pulsa «Convertir documento» para importar tu primer archivo, o «Libro de ejemplo» para ver una demostración. Tus proyectos quedan guardados en la biblioteca local.',
  },
];

function shouldShowWelcome(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

function persistDismissal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch (e) {
    console.warn('No se pudo guardar la preferencia de bienvenida:', e);
  }
}

export function showWelcomeIfNeeded(): void {
  if (!shouldShowWelcome()) return;
  showWelcome();
}

export function showWelcome(): void {
  new WelcomeModal();
}

class WelcomeModal {
  private overlay: HTMLElement;
  private currentIndex = 0;
  private dontShowAgain = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className =
      'fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm';
    this.render();
    document.body.appendChild(this.overlay);
  }

  private render() {
    const slide = SLIDES[this.currentIndex];
    const isLast = this.currentIndex === SLIDES.length - 1;

    this.overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        <div class="h-1.5 bg-slate-100">
          <div class="h-full bg-[#2563EB] transition-all duration-300" style="width: ${((this.currentIndex + 1) / SLIDES.length) * 100}%"></div>
        </div>

        <div class="p-8 sm:p-10 text-center">
          <div class="w-20 h-20 mx-auto rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mb-6">
            ${slide.icon}
          </div>
          <h2 class="text-2xl font-bold text-slate-900">${slide.title}</h2>
          <p class="mt-3 text-sm leading-relaxed text-slate-500">${slide.description}</p>
        </div>

        <div class="px-6 pb-6 sm:px-8 sm:pb-8">
          <div class="flex items-center justify-between gap-3">
            <button id="wm-skip-btn" class="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              Saltar
            </button>

            <div class="flex items-center gap-1.5">
              ${SLIDES.map(
                (_, i) => `
                <button class="wm-dot w-2 h-2 rounded-full transition-all cursor-pointer ${
                  i === this.currentIndex ? 'bg-[#2563EB] w-5' : 'bg-slate-300'
                }" data-dot="${i}" aria-label="Paso ${i + 1}"></button>
              `
              ).join('')}
            </div>

            <button id="wm-next-btn" class="px-5 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 cursor-pointer">
              ${isLast ? 'Empezar' : 'Siguiente'}
            </button>
          </div>

          <label class="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input id="wm-dont-show" type="checkbox" class="rounded text-[#2563EB] focus:ring-[#2563EB] h-4 w-4 border-slate-300" />
            No volver a mostrar
          </label>
        </div>
      </div>
    `;

    this.overlay.querySelector('#wm-next-btn')?.addEventListener('click', () => {
      if (this.currentIndex === SLIDES.length - 1) {
        this.close();
      } else {
        this.currentIndex++;
        this.render();
      }
    });

    this.overlay.querySelector('#wm-skip-btn')?.addEventListener('click', () => {
      this.close();
    });

    this.overlay.querySelector('#wm-dont-show')?.addEventListener('change', (e) => {
      this.dontShowAgain = (e.target as HTMLInputElement).checked;
    });

    this.overlay.querySelectorAll<HTMLElement>('.wm-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        this.currentIndex = Number(dot.getAttribute('data-dot'));
        this.render();
      });
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });
  }

  private close() {
    if (this.dontShowAgain) {
      persistDismissal();
    }
    this.overlay.classList.add('opacity-0');
    this.overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (this.overlay.parentElement) {
        this.overlay.parentElement.removeChild(this.overlay);
      }
    }, 300);
  }
}
