import { Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { buildPasswordValidators, PASSWORD_MIN_LENGTH, passwordsMatchValidator } from '../../validators/password.validators';

@Component({
  selector: 'app-password-reset',
  imports: [ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    HeaderComponent,
    FooterComponent,
    RouterLink],
  templateUrl: './password-reset.html',
  styleUrl: './password-reset.scss',
})
export class PasswordReset {
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  private readonly fb = inject(NonNullableFormBuilder);
  readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly iconRegistry = inject(MatIconRegistry);
  private readonly sanitizer = inject(DomSanitizer);

  loading = signal(false);

  form = this.fb.group(
    {
      password: ['', buildPasswordValidators()],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: passwordsMatchValidator,
    }
  );

  constructor() {
    this.authService.resetPasswordVisibility('password', 'confirmPassword');
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
  }

  clearPasswordError(): void {
    const passwordControl = this.form.controls.password;
    const confirmPasswordControl = this.form.controls.confirmPassword;

    if (passwordControl.hasError('passwordResetError')) {
      passwordControl.setErrors(null);
    }

    if (confirmPasswordControl.hasError('passwordResetError')) {
      confirmPasswordControl.setErrors(null);
    }

    if (this.form.hasError('passwordMismatch')) {
      this.form.updateValueAndValidity({ onlySelf: false, emitEvent: false });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { password } = this.form.getRawValue();

    try {
      const { error } = await this.authService.updatePassword(password);

      if (error) {
        this.form.controls.password.setErrors({ passwordResetError: true });
        this.toast.show('Das Passwort konnte nicht aktualisiert werden.', 'error');
        return;
      }

      this.toast.show('Anmelden', 'success');
      await this.router.navigate(['/login']);
    } finally {
      this.loading.set(false);
    }
  }
}
