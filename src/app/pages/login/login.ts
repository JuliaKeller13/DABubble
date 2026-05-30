import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    HeaderComponent,
    FooterComponent
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);

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
        this.router.navigate(['/main']);
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

  private handleError(): void {
    this.loginError.set(true);
    this.form.get('password')?.setErrors({ loginError: true });
  }
}