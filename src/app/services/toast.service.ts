import { Injectable, signal } from '@angular/core';

const DEFAULT_TOAST_DURATION = 3000;

/**
 * Service to manage and display toast notifications.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /**
   * Reference ID for the window timeout that automatically hides the active toast.
   */
  private hideTimerId: number | null = null;

  /**
   * Signal holding the current toast notification configuration or null if no toast is displayed.
   */
  readonly toast = signal<{ message: string; type: 'success' | 'error'; icon?: 'send'; overlay?: boolean } | null>(null);

  /**
   * Displays a toast message with specified configurations.
   * 
   * @param message The text message to display in the toast.
   * @param type The visual style type of the toast ('success' or 'error'). Defaults to 'success'.
   * @param duration The duration in milliseconds for which the toast remains visible. Defaults to DEFAULT_TOAST_DURATION.
   * @param icon Optional icon to show within the toast (e.g., 'send').
   * @param overlay Indicates whether a background overlay should be shown behind the toast. Defaults to true.
   */
  show(message: string, type: 'success' | 'error' = 'success', duration = DEFAULT_TOAST_DURATION, icon?: 'send', overlay = true) {
    this.clearTimer();
    this.toast.set({ message, type, icon, overlay });
    this.hideTimerId = window.setTimeout(() => {
      this.toast.set(null);
      this.hideTimerId = null;
    }, duration);
  }

  /**
   * Hides the currently active toast and clears any active auto-hide timer.
   */
  hide(): void {
    this.clearTimer();
    this.toast.set(null);
  }

  /**
   * Clears the auto-hide window timeout if one is active.
   */
  private clearTimer(): void {
    if (this.hideTimerId !== null) {
      window.clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
    }
  }
}