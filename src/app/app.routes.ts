import { Routes } from '@angular/router';
import { LandingLayoutComponent } from './components/landing-layout/landing-layout';
import { LoginComponent } from './pages/login/login';
import { ImpressumComponent } from './pages/impressum/impressum';
import { DatenschutzComponent } from './pages/datenschutz/datenschutz';
import { MainComponent } from './pages/main/main';
import { IntroComponent } from './pages/intro/intro';

export const routes: Routes = [
  // Redirect empty path to intro so the app starts with the splash animation
  { path: '', redirectTo: 'intro', pathMatch: 'full' },

  // Intro page stands outside the Landing Layout (statically loaded)
  { path: 'intro', component: IntroComponent },

  // Landing/Auth screens inside the LandingLayoutComponent
  {
    path: '',
    component: LandingLayoutComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'impressum', component: ImpressumComponent },
      { path: 'datenschutz', component: DatenschutzComponent }
    ]
  },
  
  // Main workspace page
  {
    path: 'main',
    component: MainComponent
  }
];
