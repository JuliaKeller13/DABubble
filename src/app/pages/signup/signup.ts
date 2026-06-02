import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';

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
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);

  loading = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    acceptTerms: [false, Validators.requiredTrue],
  });

  // Registers form component SVG icons on initialization
  constructor() {
    this.iconRegistry.addSvgIcon('person', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/person.svg'));
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
    this.iconRegistry.addSvgIcon('box-checked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_checked.svg'));
    this.iconRegistry.addSvgIcon('box-unchecked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_unchecked.svg'));
  }

  // Validates form input fields before proceeding to the avatar choice step
  continueToChooseAvatar(event: Event): void {
    if (this.form.invalid) {
      event.preventDefault();
      this.form.markAllAsTouched();
      return;
    }
  }
}
