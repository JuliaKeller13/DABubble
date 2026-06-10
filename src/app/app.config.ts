import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

/**
 * Application configuration provider for Angular.
 * Sets up routing with the defined application routes.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes)
  ]
};
