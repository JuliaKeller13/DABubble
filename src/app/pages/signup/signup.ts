import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    HeaderComponent,
    FooterComponent,
    RouterLink
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);

  loading = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    acceptTerms: [false, Validators.requiredTrue],
  });

  constructor() {
    this.iconRegistry.addSvgIcon('person', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/person.svg'));
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
    this.iconRegistry.addSvgIcon('box-checked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_checked.svg'));
    this.iconRegistry.addSvgIcon('box-unchecked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_unchecked.svg'));
  }

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
