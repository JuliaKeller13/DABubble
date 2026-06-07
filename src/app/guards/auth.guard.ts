import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { authService } from '../services/auth.service';

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

function createLoginRedirect(router: Router): UrlTree {
	return router.createUrlTree(['/login']);
}
