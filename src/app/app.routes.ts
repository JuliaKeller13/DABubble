import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'intro', redirectTo: 'login', pathMatch: 'full' },
  { 
    path: 'login', 
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent)
  },
  { 
    path: 'impressum', 
    loadComponent: () => import('./pages/impressum/impressum').then(m => m.ImpressumComponent) 
  },
  { 
    path: 'datenschutz', 
    loadComponent: () => import('./pages/datenschutz/datenschutz').then(m => m.DatenschutzComponent) 
  },
  { 
    path: 'main', 
    loadComponent: () => import('./pages/main/main').then(m => m.MainComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'main/channel/:channelId', 
    loadComponent: () => import('./pages/main/main').then(m => m.MainComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'main/dm/:userId', 
    loadComponent: () => import('./pages/main/main').then(m => m.MainComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'main/new-message', 
    loadComponent: () => import('./pages/main/main').then(m => m.MainComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'signup', 
    loadComponent: () => import('./pages/signup/signup').then(m => m.Signup) 
  },
  { 
    path: 'choose-avatar', 
    loadComponent: () => import('./pages/choose-avatar/choose-avatar').then(m => m.ChooseAvatar) 
  },
  { 
    path: 'forgot-password', 
    loadComponent: () => import('./pages/forgot-password/forgot-password').then(m => m.ForgotPassword) 
  },
  { 
    path: 'password-reset', 
    loadComponent: () => import('./pages/password-reset/password-reset').then(m => m.PasswordReset) 
  },
];
