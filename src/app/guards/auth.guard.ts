import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
	const authService = inject(AuthService);
	const router = inject(Router);

	if (authService.isInitialized()) {
		return authService.isAuthenticated() ? true : createLoginRedirect(router);
	}

	return toObservable(authService.isInitialized).pipe(
		filter(Boolean),
		take(1),
		map(() => (authService.isAuthenticated() ? true : createLoginRedirect(router))),
	);
};

function createLoginRedirect(router: Router): UrlTree {
	return router.createUrlTree(['/login']);
}
