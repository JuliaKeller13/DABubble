import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
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
  private fb = inject(FormBuilder);
  private router = inject(Router);

  loginError = false;
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
    this.loginError = false;
    ['email', 'password'].forEach(controlName => {
      const ctrl = this.form.get(controlName);
      if (ctrl?.hasError('loginError')) {
        ctrl.setErrors(null);
      }
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
        this.loading.set(true);
        this.loading.set(false);
    } else {
      this.form.markAllAsTouched();
    }
  }
  guestLogin(): void {
    this.router.navigate(['/main']);
  }

  loginWithGoogle(): void {
  }
}
