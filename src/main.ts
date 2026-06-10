import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Main entry point of the application.
 * Bootstraps the Angular application using the root App component and configuration.
 */
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
