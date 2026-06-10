import { Component, inject, signal, OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { authService } from '../../services/auth.service';
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
/**
 * Component representing the password reset page.
 * Allows users to enter and confirm their new password after initiating a reset.
 */
export class PasswordReset implements OnInit {
  /**
   * Lifecycle hook that runs on initialization.
   * Scrolls the window to the top.
   */
  ngOnInit(): void {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
  }

  /**
   * The minimum length required for a password.
   */
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  /**
   * Form builder instance used to construct the reactive form.
   */
  private readonly fb = inject(NonNullableFormBuilder);

  /**
   * Authentication service instance containing password update logic and password visibility state.
   */
  readonly authService = inject(authService);

  /**
   * Toast service used to display notifications.
   */
  private readonly toast = inject(ToastService);

  /**
   * Router instance used for navigating between routes.
   */
  private readonly router = inject(Router);

  /**
   * Material icon registry used to register custom SVG icons.
   */
  private readonly iconRegistry = inject(MatIconRegistry);

  /**
   * Sanitizer used to trust resource URLs of registered custom icons.
   */
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Signal indicating whether the password reset submission is loading.
   */
  loading = signal(false);

  /**
   * Form group managing the new password and its confirmation.
   */
  form = this.fb.group(
    {
      password: ['', buildPasswordValidators()],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: passwordsMatchValidator,
    }
  );

  /**
   * Constructs the PasswordReset component, resets password field visibility,
   * and registers custom lock icon.
   */
  constructor() {
    this.authService.resetPasswordVisibility('password', 'confirmPassword');
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
  }

  /**
   * Clears errors on password fields and updates form validity.
   */
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

  /**
   * Handles the submission of the password reset form.
   * Updates user's password and navigates back to the login page on success.
   *
   * @returns A promise that resolves when the password update completes.
   */
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
