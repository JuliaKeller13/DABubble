import { Routes } from '@angular/router';
import { IntroComponent } from './pages/intro/intro';
import { LoginComponent } from './pages/login/login';
import { ImpressumComponent } from './pages/impressum/impressum';
import { DatenschutzComponent } from './pages/datenschutz/datenschutz';
import { MainComponent } from './pages/main/main';
import { Signup } from './pages/signup/signup';
import { ChooseAvatar } from './pages/choose-avatar/choose-avatar';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { PasswordReset } from './pages/password-reset/password-reset';

export const routes: Routes = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroComponent },
  { path: 'login', component: LoginComponent },
  { path: 'impressum', component: ImpressumComponent },
  { path: 'datenschutz', component: DatenschutzComponent },
  { path: 'main', component: MainComponent },
  { path: 'signup', component: Signup },
  { path: 'choose-avatar', component: ChooseAvatar },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'password-reset', component: PasswordReset },
];
