import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { SignupStateService } from '../../services/signup-state.service';
import { authService } from '../../services/auth.service';
import { buildPasswordValidators, PASSWORD_MIN_LENGTH } from '../../validators/password.validators';

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
/**
 * Component representing the registration (sign up) page.
 * Collects name, email, password, and terms acceptance, caching the data
 * in SignupStateService before redirection to choose an avatar.
 */
export class Signup {
  /**
   * The minimum password length required.
   */
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  /**
   * Form builder instance used to construct the reactive form.
   */
  private fb = inject(NonNullableFormBuilder);

  /**
   * Router instance used for navigating between routes.
   */
  private router = inject(Router);

  /**
   * Material icon registry used to register custom SVG icons.
   */
  private iconRegistry = inject(MatIconRegistry);

  /**
   * Sanitizer used to trust resource URLs of registered custom icons.
   */
  private sanitizer = inject(DomSanitizer);

  /**
   * Signup state service used to cache sign-up data across steps.
   */
  private signupState = inject(SignupStateService);

  /**
   * Authentication service instance containing auth status and visibility configuration.
   */
  readonly authService = inject(authService);

  /**
   * Signal indicating whether the sign-up submission is in a loading state.
   */
  loading = signal(false);

  /**
   * Form group managing the registration fields: name, email, password, and terms acceptance.
   */
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
    password: ['', buildPasswordValidators()],
    acceptTerms: [false, Validators.requiredTrue],
  });

  /**
   * Constructs the Signup component, resets password visibility,
   * registers custom SVG icons, and restores cached state from SignupStateService if available.
   */
  constructor() {
    this.authService.resetPasswordVisibility('password');
    this.iconRegistry.addSvgIcon('person', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/person.svg'));
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
    this.iconRegistry.addSvgIcon('box-checked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_checked.svg'));
    this.iconRegistry.addSvgIcon('box-unchecked', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/button_icons/box_unchecked.svg'));

    const cachedState = this.signupState.signupData();
    if (cachedState) {
      this.form.patchValue(cachedState);
    }
  }

  /**
   * Validates form and saves draft data into signup state, then redirects to choose-avatar view.
   *
   * @param event - The trigger event.
   * @returns A promise that resolves when navigation completes.
   */
  async continueToChooseAvatar(event: Event): Promise<void> {
    if (this.form.invalid) {
      event.preventDefault();
      this.form.markAllAsTouched();
      return;
    }

    this.signupState.setSignupData(this.form.getRawValue());
    await this.router.navigate(['/choose-avatar']);
  }
}
