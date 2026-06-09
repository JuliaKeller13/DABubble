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
export class ChooseAvatar {
  private readonly successToastDuration = 1500;
  private readonly existingUserErrorCodes = new Set(['user_already_exists']);
  private router = inject(Router);
  private authService = inject(authService);
  private avatarSvc = inject(avatarService);
  private toast = inject(ToastService);
  private signupState = inject(SignupStateService);

  loading = signal(false);
  private signupData: SignupData | null = null;

  private readonly defaultAvatar = this.avatarSvc.getDefaultAvatar();
  selectedAvatar = signal(this.defaultAvatar);
  readonly avatarSelected = computed(() => this.selectedAvatar() !== this.defaultAvatar);
  readonly previewAvatar = computed(() => {
    const avatar = this.selectedAvatar().trim();
    return avatar || this.defaultAvatar;
  });

  readonly avatars = this.avatarSvc.getAvatars();

  get userName(): string {
    return this.signupData?.name ?? '';
  }

  selectAvatar(src: string): void {
    this.selectedAvatar.set(src);
  }

  resetToDefaultAvatar(): void {
    this.selectedAvatar.set(this.defaultAvatar);
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