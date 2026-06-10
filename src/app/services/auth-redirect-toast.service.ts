import { Injectable } from '@angular/core';

/**
 * Service to handle post-authentication redirects, specifically cleaning up query parameters
 * after a successful Google login redirect.
 */
@Injectable({ providedIn: 'root' })
export class AuthRedirectToastService {
  /**
   * Checks the URL for Google login success parameters, and if present, cleans up the query parameter
   * from the browser's history state without triggering a page reload.
   */
  handleGoogleLoginSuccess(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') !== 'google-login-success') return;
    url.searchParams.delete('auth');
    const search = url.searchParams.toString();
    history.replaceState(history.state, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  }
}