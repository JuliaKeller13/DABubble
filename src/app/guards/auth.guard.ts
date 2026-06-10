import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { authService } from '../services/auth.service';

/**
 * Route guard that ensures users are authenticated before accessing protected routes.
 * If authentication is initialized, it immediately checks authentication status.
 * Otherwise, it waits for the authentication service to initialize before making the decision.
 * Unauthenticated users are redirected to the login page.
 * 
 * @returns A boolean, UrlTree, or an Observable resolving to either, indicating activation status.
 */
export const authGuard: CanActivateFn = () => {
	const authSvc = inject(authService);
	const router = inject(Router);

	if (authSvc.isInitialized()) {
		return authSvc.isAuthenticated() ? true : createLoginRedirect(router);
	}

	return toObservable(authSvc.isInitialized).pipe(
		filter(Boolean),
		take(1),
		map(() => (authSvc.isAuthenticated() ? true : createLoginRedirect(router))),
	);
};

/**
 * Creates a UrlTree redirecting to the login path.
 * 
 * @param router - The Angular Router service instance.
 * @returns A UrlTree targeting the '/login' path.
 */
function createLoginRedirect(router: Router): UrlTree {
	return router.createUrlTree(['/login']);
}
