import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';

const DEFAULT_TOAST_DURATION = 3000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly router = inject(Router);
  private hideTimerId: number | null = null;

  readonly toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  constructor() {
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart && this.isLoginRoute(event.url)) {
          this.hide();
        }
      });
  }

  show(message: string, type: 'success' | 'error' = 'success', duration = DEFAULT_TOAST_DURATION) {
    this.clearTimer();
    this.toast.set({ message, type });
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

  private isLoginRoute(url: string): boolean {
    const normalizedUrl = url.split('?')[0]?.split('#')[0] ?? '';

    return normalizedUrl === '/login' || normalizedUrl.endsWith('/login');
  }
}
