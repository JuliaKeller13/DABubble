import { Injectable, signal } from '@angular/core';

export type SignupData = {
  name: string;
  email: string;
  password: string;
};

const SIGNUP_STATE_STORAGE_KEY = 'dabubble.signup.state';

/**
 * Service to manage and temporarily persist registration data during the multi-step signup process.
 * Data is held in a read-only signal and synchronized with sessionStorage.
 */
@Injectable({ providedIn: 'root' })
export class SignupStateService {
  /**
   * Internal writable signal holding the current signup data or null if no registration is in progress.
   */
  private readonly signupDataSignal = signal<SignupData | null>(this.readFromStorage());

  /**
   * Public read-only signal exposing the current registration state.
   */
  readonly signupData = this.signupDataSignal.asReadonly();

  /**
   * Updates the registration data, saving it to both the signal and sessionStorage.
   * 
   * @param data The signup data (name, email, password) to set.
   */
  setSignupData(data: SignupData): void {
    this.signupDataSignal.set(data);
    this.writeToStorage(data);
  }

  /**
   * Clears the registration data from the signal and sessionStorage.
   */
  clearSignupData(): void {
    this.signupDataSignal.set(null);
    this.removeFromStorage();
  }

  /**
   * Reads and parses registration data from sessionStorage.
   * 
   * @returns The parsed SignupData, or null if not found or invalid.
   */
  private readFromStorage(): SignupData | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(SIGNUP_STATE_STORAGE_KEY);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Partial<SignupData>;
      return (p.name && p.email && p.password) ? { name: p.name, email: p.email, password: p.password } : null;
    } catch {
      return null;
    }
  }

  /**
   * Writes registration data to sessionStorage.
   * 
   * @param data The signup data to store.
   */
  private writeToStorage(data: SignupData): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(SIGNUP_STATE_STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Removes registration data from sessionStorage.
   */
  private removeFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(SIGNUP_STATE_STORAGE_KEY);
  }
}