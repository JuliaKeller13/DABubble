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

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
/**
 * Component representing the forgot password page.
 * Allows users to enter their email address to receive a password reset link.
 */
export class ForgotPassword implements OnInit {
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
   * Form builder instance used to construct the reactive form.
   */
  private readonly fb = inject(NonNullableFormBuilder);

  /**
   * Authentication service instance containing password reset request logic.
   */
  private readonly authService = inject(authService);

  /**
   * Toast service used to display success or error notifications.
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
   * Signal indicating whether the password reset request is loading.
   */
  loading = signal(false);

  /**
   * Form group managing the email input.
   */
  form = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
      ],
    ],
  });

  /**
   * Constructs the ForgotPassword component and registers custom SVG icons.
   */
  constructor() {
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
  }

  /**
   * Clears any active password reset errors on the email form control.
   */
  clearLoginError(): void {
    const emailControl = this.form.controls.email;
    if (emailControl.hasError('passwordResetError')) {
      emailControl.setErrors(null);
    }
  }

  /**
   * Handles the submission of the forgot password form.
   * Triggers the auth service's password reset request and navigates back to the login page on success.
   *
   * @returns A promise that resolves when the password reset attempt completes.
   */
  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email } = this.form.getRawValue();

    try {
      const { error } = await this.authService.requestPasswordReset(email);

      if (error) {
        this.form.controls.email.setErrors({ passwordResetError: true });
        this.toast.show('Die E-Mail zum Zuruecksetzen konnte nicht gesendet werden.', 'error');
        return;
      }

      this.toast.show('E-Mail gesendet', 'success', undefined, 'send');
      await this.router.navigate(['/login']);
    } finally {
      this.loading.set(false);
    }
  }
}
