import { Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class AuthRedirectToastService {
  private readonly toast = inject(ToastService);
  private readonly redirectToastDuration = 1800;

  handleGoogleLoginSuccess(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const authState = url.searchParams.get('auth');

    if (authState !== 'google-login-success') {
      return;
    }

    url.searchParams.delete('auth');

    const search = url.searchParams.toString();
    const cleanedUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    history.replaceState(history.state, '', cleanedUrl);
  }
}