import type { AppView } from '../types';

interface Step {
  view: AppView;
  label: string;
}

const STEPS: Step[] = [
  { view: 'convert', label: 'Importar' },
  { view: 'chapters', label: 'Capítulos' },
  { view: 'meta', label: 'Carátula y datos' },
  { view: 'export', label: 'Exportar' },
];

/**
 * Horizontal step indicator used during the conversion workflow.
 */
export class StepNav {
  private element: HTMLElement;
  private onNavigate: (view: AppView) => void;

  constructor(onNavigate: (view: AppView) => void) {
    this.onNavigate = onNavigate;
    this.element = document.createElement('nav');
    this.element.className =
      'bg-white border border-slate-200 rounded-xl px-2 py-2 mb-6 overflow-x-auto flex items-center gap-1';
    this.render('convert', false);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * @param current active view
   * @param clickable whether steps may be clicked (project exists)
   */
  render(current: AppView, clickable: boolean) {
    const currentIndex = STEPS.findIndex((s) => s.view === current);

    this.element.innerHTML = STEPS.map((step, i) => {
      const isActive = i === currentIndex;
      const isDone = currentIndex >= 0 && i < currentIndex;
      const enabled = clickable || i === 0;

      const base =
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition shrink-0';
      const state = isActive
        ? 'bg-blue-50 text-[#2563EB]'
        : isDone
          ? 'text-slate-600 hover:bg-slate-50'
          : 'text-slate-400';
      const cursor = enabled ? 'cursor-pointer' : 'cursor-not-allowed';

      const badge = isDone
        ? `<span class="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
             <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
           </span>`
        : `<span class="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
            isActive ? 'bg-[#2563EB] text-white' : 'bg-slate-200 text-slate-500'
          }">${i + 1}</span>`;

      const stepBtn = `<button data-step="${step.view}" class="${base} ${state} ${cursor}" ${
        enabled ? '' : 'disabled'
      }>${badge}<span>${step.label}</span></button>`;

      const separator =
        i < STEPS.length - 1
          ? `<div class="hidden sm:block w-6 h-px bg-slate-200 shrink-0 mx-0.5"></div>`
          : '';

      return stepBtn + separator;
    }).join('');

    if (clickable) {
      this.element.querySelectorAll<HTMLElement>('[data-step]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.onNavigate(btn.getAttribute('data-step') as AppView);
        });
      });
    }
  }
}
