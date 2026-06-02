import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    HeaderComponent,
    FooterComponent,
    RouterLink
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);

  // Registers SVG icons for the login form input fields
  constructor() {
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
  }

  loginError = signal(false);
  loading = signal(false);

  form = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
      ],
    ],
    password: ['', Validators.required],
  });

  // Resets the login error state and clears password control errors
  clearLoginError(): void {
    this.loginError.set(false);
    const passwordCtrl = this.form.get('password');
    if (passwordCtrl?.hasError('loginError')) {
      passwordCtrl.setErrors(null);
    }
  }

  // Handles the email/password authentication submission
  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.loginError.set(false);

    const { email, password } = this.form.getRawValue();

    try {
      const { error } = await this.authService.loginWithEmail(email, password);

      if (error) {
        this.handleError();
      } else {
        this.router.navigate(['/main']);
      }
    } catch (e) {
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  // Triggers a guest login and redirects to the main app dashboard
  async guestLogin(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);
    try {
      const { error } = await this.authService.guestLogin();
      if (error) {
        this.handleError();
      } else {
        this.router.navigate(['/main']);
      }
    } catch (e) {
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  // Initiates OAuth login using the Google provider
  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);

    try {
      const targetUrl = `${window.location.origin}/main`;
      const { error } = await this.authService.loginWithGoogle(targetUrl);

      if (error) {
        throw error;
      }
    } catch (e) {
      console.error('Google Login Fehler:', e);
      this.loginError.set(true);
      this.loading.set(false);
    }
  }

  // Sets state and validator error markers on authentication failure
  private handleError(): void {
    this.loginError.set(true);
    this.form.get('password')?.setErrors({ loginError: true });
  }
}