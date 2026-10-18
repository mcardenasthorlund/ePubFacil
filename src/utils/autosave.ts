export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced auto-save helper. Coalesces rapid changes into a single save and
 * serializes concurrent runs so writes never overlap.
 */
export class AutoSaver {
  private timer: number | null = null;
  private running = false;
  private pending = false;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly options: { delay?: number; onState?: (state: SaveState) => void } = {}
  ) {}

  /** Schedules a save after the debounce delay. */
  schedule() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.options.delay ?? 1200);
  }

  /** Cancels any pending save without running it. */
  cancel() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Runs any pending save immediately and waits for it to finish. */
  async flush(): Promise<void> {
    this.cancel();
    await this.run();
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    this.options.onState?.('saving');
    try {
      await this.save();
      this.options.onState?.('saved');
    } catch (err) {
      console.error('[AutoSaver] Error al guardar:', err);
      this.options.onState?.('error');
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        void this.run();
      }
    }
  }
}

export function saveStatusLabel(state: SaveState, at?: Date): string {
  switch (state) {
    case 'saving':
      return 'Guardando…';
    case 'saved':
      return at
        ? `Guardado a las ${at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
        : 'Guardado';
    case 'error':
      return 'No se pudo guardar';
    default:
      return 'Guardado automático activado';
  }
}
