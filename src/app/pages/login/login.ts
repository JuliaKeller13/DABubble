import { Component, effect, inject, signal, OnInit } from '@angular/core';
import { authService } from '../../services/auth.service';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { ToastService } from '../../services/toast.service';
import { IntroComponent } from '../intro/intro';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    HeaderComponent,
    FooterComponent,
    RouterLink,
    IntroComponent
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
/**
 * Component representing the login page of the application.
 * Handles normal email/password login, guest login, and Google authentication.
 */
export class LoginComponent implements OnInit {
  /**
   * Signal indicating whether the intro animation should be displayed.
   */
  showIntro = signal(false);

  /**
   * Lifecycle hook that runs on initialization.
   * Scrolls to top and checks if the intro should be displayed.
   */
  ngOnInit(): void {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
    if (typeof window !== 'undefined' && !sessionStorage.getItem('introShown')) {
      this.showIntro.set(true);
      sessionStorage.setItem('introShown', 'true');
    }
  }

  /**
   * Callback executed when the intro animation is finished.
   * Hides the intro component.
   */
  onIntroFinished(): void {
    this.showIntro.set(false);
  }

  /**
   * Form builder instance used to construct the reactive form.
   */
  private fb = inject(NonNullableFormBuilder);

  /**
   * Router instance used for navigating between routes.
   */
  private router = inject(Router);

  /**
   * Authentication service instance containing auth status and logic.
   */
  readonly authService = inject(authService);

  /**
   * Toast service used to display notifications to the user.
   */
  private toast = inject(ToastService);

  /**
   * Material icon registry used to register custom SVG icons.
   */
  private iconRegistry = inject(MatIconRegistry);

  /**
   * Sanitizer used to trust resource URLs of registered custom icons.
   */
  private sanitizer = inject(DomSanitizer);

  /**
   * Constructs the LoginComponent, resets password visibility states,
   * registers custom SVG icons, and sets up auth state change monitoring.
   */
  constructor() {
    this.authService.resetPasswordVisibility('password');
    this.iconRegistry.addSvgIcon('mail', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/mail.svg'));
    this.iconRegistry.addSvgIcon('lock', this.sanitizer.bypassSecurityTrustResourceUrl('img/icons/form/lock.svg'));
    effect(() => {
      if (!this.authService.isInitialized() || !this.authService.isAuthenticated()) {
        return;
      }
      void this.router.navigate(['/main']);
    });
  }

  /**
   * Signal indicating if a login error occurred.
   */
  loginError = signal(false);

  /**
   * Signal indicating if a login operation is currently loading.
   */
  loading = signal(false);

  /**
   * Form group managing the email and password inputs.
   */
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

  /**
   * Clears the current login error and resets the custom password field error.
   */
  clearLoginError(): void {
    this.loginError.set(false);
    const passwordCtrl = this.form.get('password');
    if (passwordCtrl?.hasError('loginError')) {
      passwordCtrl.setErrors(null);
    }
  }

  /**
   * Handles the submission of the email/password login form.
   * Performs validation, triggers auth service login, and manages state.
   *
   * @returns A promise that resolves when the submit process completes.
   */
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
        await this.redirectToMain();
      }
    } catch (e) {
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Performs guest login and redirects user to main page upon success.
   * Shows error toast message on failure.
   *
   * @returns A promise that resolves when the guest login process completes.
   */
  async guestLogin(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);
    try {
      const { error } = await this.authService.guestLogin();
      if (error) {
        console.error('Gast-Login Fehler:', error);
        this.toast.show('Gast-Login ist derzeit nicht verfügbar.', 'error');
        this.handleError();
      } else {
        await this.redirectToMain();
      }
    } catch (e) {
      console.error('Gast-Login Ausnahme:', e);
      this.toast.show('Gast-Login ist derzeit nicht verfügbar.', 'error');
      this.handleError();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Initiates Google authentication process.
   * Sets loading states and handles potential errors.
   *
   * @returns A promise that resolves when the Google sign-in completes.
   */
  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.loginError.set(false);

    try {
      const targetUrl = new URL('main?auth=google-login-success', document.baseURI).href;
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

  /**
   * Handles error states by setting login error signals and form field errors.
   */
  private handleError(): void {
    this.loginError.set(true);
    this.form.get('password')?.setErrors({ loginError: true });
  }

  /**
   * Navigates the router to the main application page.
   *
   * @returns A promise that resolves when navigation completes.
   */
  private async redirectToMain(): Promise<void> {
    await this.router.navigate(['/main']);
  }
}