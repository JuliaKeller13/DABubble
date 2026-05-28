import { Routes } from '@angular/router';
import { IntroComponent } from './pages/intro/intro';
import { LoginComponent } from './pages/login/login';
import { ImpressumComponent } from './pages/impressum/impressum';
import { DatenschutzComponent } from './pages/datenschutz/datenschutz';
import { MainComponent } from './pages/main/main';

export const routes: Routes = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroComponent },
  { path: 'login', component: LoginComponent },
  { path: 'impressum', component: ImpressumComponent },
  { path: 'datenschutz', component: DatenschutzComponent },
  { path: 'main', component: MainComponent }
];
