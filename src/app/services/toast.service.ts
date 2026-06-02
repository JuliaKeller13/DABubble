import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  // Displays a temporary toast notification message with a specified type and duration
  show(message: string, type: 'success' | 'error' = 'success', duration = 3000) {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), duration);
  }
}
