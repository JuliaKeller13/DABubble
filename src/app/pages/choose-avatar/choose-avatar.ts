import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { SignupData, SignupStateService } from '../../services/signup-state.service';

@Component({
  selector: 'app-choose-avatar',
  imports: [HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './choose-avatar.html',
  styleUrl: './choose-avatar.scss'
})
export class ChooseAvatar {
  private readonly loginRedirectDelay = 1800;
  private readonly existingUserErrorCodes = new Set(['user_already_exists']);
  private router = inject(Router);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private signupState = inject(SignupStateService);

  loading = signal(false);
  private signupData: SignupData | null = null;

  selectedAvatar = signal('img/avatars/avatar_default.svg');
  private readonly defaultAvatar = 'img/avatars/avatar_default.svg';
  readonly avatarSelected = computed(() => this.selectedAvatar() !== this.defaultAvatar);

  readonly avatars = [
    'img/avatars/avatar_female_1.svg',
    'img/avatars/avatar_female_2.svg',
    'img/avatars/avatar_male_1.svg',
    'img/avatars/avatar_male_2.svg',
    'img/avatars/avatar_male_3.svg',
    'img/avatars/avatar_male_4.svg',
  ];

  get userName(): string {
    return this.signupData?.name ?? '';
  }

  selectAvatar(src: string): void {
    this.selectedAvatar.set(src);
  }

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

  // Performs final user registration request using temporary signup data
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
    this.toast.show('Konto erfolgreich erstellt!', 'success', this.loginRedirectDelay);
    window.setTimeout(() => this.router.navigate(['/login']), this.loginRedirectDelay);
  }

  private applyGoogleAvatarDefault(): void {
    const profileAvatar = this.authService.currentUserProfile()?.avatar_url?.trim();
    if (profileAvatar) {
      this.selectedAvatar.set(profileAvatar);
      return;
    }

    const metadata = this.authService.currentUser()?.user_metadata;
    const metadataAvatar = metadata?.['avatar_url'] ?? metadata?.['picture'] ?? metadata?.['picture_url'];
    if (typeof metadataAvatar === 'string' && metadataAvatar.trim().length > 0) {
      this.selectedAvatar.set(metadataAvatar);
    }
  }

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