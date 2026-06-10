import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { authService } from '../../services/auth.service';
import { avatarService } from '../../services/avatar.service';
import { ToastService } from '../../services/toast.service';
import { SignupData, SignupStateService } from '../../services/signup-state.service';

@Component({
  selector: 'app-choose-avatar',
  imports: [HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './choose-avatar.html',
  styleUrl: './choose-avatar.scss'
})
/**
 * Component that allows users to select an avatar during the sign-up process.
 * Displays default avatars, handles external profile images (like Google sign-in details),
 * and completes the registration by calling the authService.
 */
export class ChooseAvatar {
  /**
   * The duration in milliseconds that a successful registration toast is shown.
   */
  private readonly successToastDuration = 1500;

  /**
   * Set of database error codes representing an already registered user.
   */
  private readonly existingUserErrorCodes = new Set(['user_already_exists']);

  /**
   * Router instance used for navigating between routes.
   */
  private router = inject(Router);

  /**
   * Authentication service instance containing registration logic.
   */
  private authService = inject(authService);

  /**
   * Avatar service used to retrieve default and list of avatars.
   */
  private avatarSvc = inject(avatarService);

  /**
   * Toast service used to display feedback notifications.
   */
  private toast = inject(ToastService);

  /**
   * Signup state service containing the temporary cached user registration details.
   */
  private signupState = inject(SignupStateService);

  /**
   * Signal indicating whether the sign-up process is currently sending request to auth service.
   */
  loading = signal(false);

  /**
   * Draft registration details cached from the previous sign-up step.
   */
  private signupData: SignupData | null = null;

  /**
   * The default avatar image source path.
   */
  private readonly defaultAvatar = this.avatarSvc.getDefaultAvatar();

  /**
   * Signal containing the current selected avatar image source path.
   */
  selectedAvatar = signal(this.defaultAvatar);

  /**
   * Computed signal indicating whether the user has selected a custom avatar.
   */
  readonly avatarSelected = computed(() => this.selectedAvatar() !== this.defaultAvatar);

  /**
   * Computed signal returning the normalized preview avatar image source path.
   */
  readonly previewAvatar = computed(() => {
    const avatar = this.selectedAvatar().trim();
    return avatar || this.defaultAvatar;
  });

  /**
   * List of available avatar image sources.
   */
  readonly avatars = this.avatarSvc.getAvatars();

  /**
   * Gets the name of the registering user.
   */
  get userName(): string {
    return this.signupData?.name ?? '';
  }

  /**
   * Selects an avatar from the choices.
   *
   * @param src - The source URL or file path of the selected avatar.
   */
  selectAvatar(src: string): void {
    this.selectedAvatar.set(src);
  }

  /**
   * Resets the selected avatar to the default fallback avatar.
   */
  resetToDefaultAvatar(): void {
    this.selectedAvatar.set(this.defaultAvatar);
  }

  /**
   * Constructs the ChooseAvatar component.
   * Verifies that signup metadata exists, otherwise redirects the user back to the signup form.
   */
  constructor() {
    const cachedState = this.signupState.signupData();

    if (cachedState) {
      this.signupData = cachedState;
      this.applyGoogleAvatarDefault();
      return;
    }

    this.toast.show('Bitte zuerst die Registrierungsdaten ausfuellen.', 'error');
    this.router.navigate(['/signup']);
  }

  /**
   * Completes the user sign-up process.
   * Submits the cached registration data together with the selected avatar to the database.
   *
   * @returns A promise that resolves when registration attempts finish.
   */
  async completeSignup(): Promise<void> {
    if (!this.signupData) {
      this.toast.show('Bitte zuerst die Registrierungsdaten ausfuellen.', 'error');
      this.router.navigate(['/signup']);
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.signupData;
    const { error } = await this.authService.signup(name, email, password, this.selectedAvatar());
    this.loading.set(false);

    if (error) {
      const isExisting = this.isExistingUserError(error);
      const msg = isExisting
        ? 'Benutzer ist bereits registriert.'
        : 'Registrierung fehlgeschlagen.';
      this.toast.show(msg, 'error');
      return;
    }

    this.signupState.clearSignupData();
    this.toast.show('Konto erfolgreich erstellt!', 'success', this.successToastDuration);
    await this.router.navigate(['/login']);
  }

  /**
   * Attempts to load a profile picture URL from Google Auth metadata,
   * setting it as the selected avatar if found.
   */
  private applyGoogleAvatarDefault(): void {
    const profileAvatar = this.authService.currentUserProfile()?.avatar_url?.trim();
    if (profileAvatar) {
      this.selectedAvatar.set(this.avatarSvc.normalizeAvatarUrl(profileAvatar));
      return;
    }

    const metadata = this.authService.currentUser()?.user_metadata;
    const metadataAvatar = metadata?.['avatar_url'] ?? metadata?.['picture'] ?? metadata?.['picture_url'];
    if (typeof metadataAvatar === 'string' && metadataAvatar.trim().length > 0) {
      this.selectedAvatar.set(this.avatarSvc.normalizeAvatarUrl(metadataAvatar));
    }
  }

  /**
   * Helper that checks if a thrown error represents an "already exists" sign-up validation error.
   *
   * @param error - The error response.
   * @returns True if error indicates user already exists, false otherwise.
   */
  private isExistingUserError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorRecord = error as Record<string, unknown>;
    const errorCode = errorRecord['code'];
    const errorStatus = errorRecord['status'];

    return (
      (typeof errorCode === 'string' && this.existingUserErrorCodes.has(errorCode)) ||
      errorStatus === 422
    );
  }
}