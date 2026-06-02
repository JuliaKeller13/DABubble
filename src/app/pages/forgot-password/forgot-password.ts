import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-forgot-password',
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
export class ForgotPassword {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly iconRegistry = inject(MatIconRegistry);
  private readonly sanitizer = inject(DomSanitizer);

  loading = signal(false);

  form = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
      ],
    ],
  });

  constructor() {
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
  }

  clearLoginError(): void {
    const emailControl = this.form.controls.email;
    if (emailControl.hasError('passwordResetError')) {
      emailControl.setErrors(null);
    }
  }

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

      this.toast.show('Die E-Mail zum Zuruecksetzen wurde gesendet.', 'success');
      await this.router.navigate(['/login']);
    } finally {
      this.loading.set(false);
    }
  }
}
