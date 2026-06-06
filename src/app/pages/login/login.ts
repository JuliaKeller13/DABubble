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
import { ToastService } from '../../services/toast.service';

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
  private readonly successToastDuration = 1500;
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  readonly authService = inject(AuthService);
  private toast = inject(ToastService);
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);

  constructor() {
    this.authService.resetPasswordVisibility('password');
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

  clearLoginError(): void {
    this.loginError.set(false);
    const passwordCtrl = this.form.get('password');
    if (passwordCtrl?.hasError('loginError')) {
      passwordCtrl.setErrors(null);
    }
  }

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
        await this.redirectToMain();
      }
    } catch (e) {
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  async guestLogin(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);
    try {
      const { error } = await this.authService.guestLogin();
      if (error) {
        console.error('Gast-Login Fehler:', error);
        this.toast.show('Gast-Login ist derzeit nicht verfügbar.', 'error');
        this.handleError();
      } else {
        await this.redirectToMain();
      }
    } catch (e) {
      console.error('Gast-Login Ausnahme:', e);
      this.toast.show('Gast-Login ist derzeit nicht verfügbar.', 'error');
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);

    try {
      const targetUrl = new URL('main?auth=google-login-success', document.baseURI).href;
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

  private handleError(): void {
    this.loginError.set(true);
    this.form.get('password')?.setErrors({ loginError: true });
  }

  private async redirectToMain(): Promise<void> {
    await this.router.navigate(['/main']);
  }
}