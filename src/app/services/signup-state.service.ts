import { Injectable, signal } from '@angular/core';

export type SignupData = {
  name: string;
  email: string;
  password: string;
};

const SIGNUP_STATE_STORAGE_KEY = 'dabubble.signup.state';

@Injectable({ providedIn: 'root' })
export class SignupStateService {
  private readonly signupDataSignal = signal<SignupData | null>(this.readFromStorage());

  readonly signupData = this.signupDataSignal.asReadonly();

  setSignupData(data: SignupData): void {
    this.signupDataSignal.set(data);
    this.writeToStorage(data);
  }

  clearSignupData(): void {
    this.signupDataSignal.set(null);
    this.removeFromStorage();
  }

  private readFromStorage(): SignupData | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = window.sessionStorage.getItem(SIGNUP_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<SignupData>;
      if (!parsed.name || !parsed.email || !parsed.password) {
        return null;
      }

      return {
        name: parsed.name,
        email: parsed.email,
        password: parsed.password,
      };
    } catch {
      return null;
    }
  }

  private writeToStorage(data: SignupData): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(SIGNUP_STATE_STORAGE_KEY, JSON.stringify(data));
  }

  private removeFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(SIGNUP_STATE_STORAGE_KEY);
  }
}