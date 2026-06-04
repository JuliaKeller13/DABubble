import { Injectable, signal } from '@angular/core';

const DEFAULT_TOAST_DURATION = 3000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private hideTimerId: number | null = null;

  readonly toast = signal<{ message: string; type: 'success' | 'error'; icon?: 'send'; overlay?: boolean } | null>(null);

  show(message: string, type: 'success' | 'error' = 'success', duration = DEFAULT_TOAST_DURATION, icon?: 'send', overlay = true) {
    this.clearTimer();
    this.toast.set({ message, type, icon, overlay });
    this.hideTimerId = window.setTimeout(() => {
      this.toast.set(null);
      this.hideTimerId = null;
    }, duration);
  }

  hide(): void {
    this.clearTimer();
    this.toast.set(null);
  }

  private clearTimer(): void {
    if (this.hideTimerId !== null) {
      window.clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
    }
  }
}