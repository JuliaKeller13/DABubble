import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthRedirectToastService {
  handleGoogleLoginSuccess(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') !== 'google-login-success') return;
    url.searchParams.delete('auth');
    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  }
}