import { Router, RouterLink } from '@angular/router';
import { Component, inject } from '@angular/core';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { signal } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    HeaderComponent,
    FooterComponent,
    RouterLink
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private fb = inject(NonNullableFormBuilder);

  protected router = inject(Router);

  loading = signal(false);

  form = this.fb.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(3)
      ]
    ],
    email: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]
    ],
    password: [
      '',
      [Validators.required, Validators.minLength(6)]
    ],
    acceptTerms: [false, Validators.requiredTrue]
  });
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  async signUp(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.form.getRawValue();
    const { error } = await this.authService.signup(name, email, password);
    this.loading.set(false);

    if (error) {
      this.toast.show('Registrierung fehlgeschlagen: ' + (error.message || error), 'error');
      return;
    }
    this.toast.show('Konto erfolgreich erstellt!', 'success');
    this.router.navigate(['/login']);
  }
}
