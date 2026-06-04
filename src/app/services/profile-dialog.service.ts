import { Injectable, computed, inject, signal } from '@angular/core';
import { User } from '../interfaces/user.interface';
import { AuthService } from './auth.service';
import { userService } from './user.service';

type ProfileDialogOpenOptions = {
  suppressOutsideCloseOnce?: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class ProfileDialogService {
  private readonly authService = inject(AuthService);
  private readonly userSvc = inject(userService);
  private readonly selectedProfileSignal = signal<User | null>(null);
  private suppressNextOutsideClose = false;

  readonly selectedProfile = this.selectedProfileSignal.asReadonly();
  readonly isOpen = computed(() => this.selectedProfile() !== null);
  readonly isCurrentUserProfile = computed(() => {
    const selectedProfile = this.selectedProfile();
    const currentProfile = this.authService.currentUserProfile();

    return !!selectedProfile && !!currentProfile && selectedProfile.id === currentProfile.id;
  });

  open(profile: User, options?: ProfileDialogOpenOptions): void {
    this.selectedProfileSignal.set(profile);
    this.suppressNextOutsideClose = !!options?.suppressOutsideCloseOnce && this.isOwnProfile(profile.id);
  }

  async openById(userId: string, options?: ProfileDialogOpenOptions): Promise<void> {
    const currentProfile = this.authService.currentUserProfile();

    if (currentProfile?.id === userId) {
      this.selectedProfileSignal.set(currentProfile);
      this.suppressNextOutsideClose = !!options?.suppressOutsideCloseOnce;
      return;
    }

    const profile = await this.userSvc.getUserById(userId);
    if (profile) {
      this.selectedProfileSignal.set(profile);
      this.suppressNextOutsideClose = false;
    }
  }

  consumeOutsideCloseSuppression(): boolean {
    if (!this.suppressNextOutsideClose) {
      return false;
    }

    this.suppressNextOutsideClose = false;
    return true;
  }

  close(): void {
    this.selectedProfileSignal.set(null);
    this.suppressNextOutsideClose = false;
  }

  private isOwnProfile(userId: string): boolean {
    return this.authService.currentUserProfile()?.id === userId;
  }
}