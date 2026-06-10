import { Injectable, computed, inject, signal } from '@angular/core';
import { User } from '../interfaces/user.interface';
import { authService } from './auth.service';
import { userService } from './user.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DialogProfileComponent } from '../components/dialog-profile/dialog-profile';

/**
 * Configuration options for opening the profile dialog.
 */
type ProfileDialogOpenOptions = {
  /**
   * Whether to suppress the outside click closing behavior once.
   */
  suppressOutsideCloseOnce?: boolean;
};

@Injectable({
  providedIn: 'root',
})
/**
 * Service that manages the state, visibility, and data of the user profile dialog.
 */
export class ProfileDialogService {
  /**
   * The injected MatDialog service.
   */
  private readonly dialog = inject(MatDialog);

  /**
   * The injected authService instance.
   */
  private readonly authService = inject(authService);

  /**
   * The injected userService instance.
   */
  private readonly userSvc = inject(userService);

  /**
   * Internal signal holding the currently selected user profile.
   */
  private readonly selectedProfileSignal = signal<User | null>(null);

  /**
   * Internal flag to suppress the next close event caused by outside clicks.
   */
  private suppressNextOutsideClose = false;

  /**
   * Read-only signal exposing the currently selected user profile.
   */
  readonly selectedProfile = this.selectedProfileSignal.asReadonly();

  /**
   * Computed signal indicating whether the profile dialog is currently open.
   */
  readonly isOpen = computed(() => this.selectedProfile() !== null);

  /**
   * Computed signal indicating whether the open profile is the current user's profile.
   */
  readonly isCurrentUserProfile = computed(() => {
    const selectedProfile = this.selectedProfile();
    const currentProfile = this.authService.currentUserProfile();

    return !!selectedProfile && !!currentProfile && selectedProfile.id === currentProfile.id;
  });

  /**
   * Opens the profile dialog for a specific user profile.
   *
   * @param profile - The user profile data to display.
   * @param options - Configuration options for the dialog.
   */
  open(profile: User, options?: ProfileDialogOpenOptions): void {
    this.selectedProfileSignal.set(profile);
    this.suppressNextOutsideClose = !!options?.suppressOutsideCloseOnce && this.isOwnProfile(profile.id);
  }

  /**
   * Fetches a user profile by ID and opens the profile dialog.
   *
   * @param userId - The ID of the user whose profile should be opened.
   * @param options - Configuration options for the dialog.
   * @returns A promise that resolves when the operation is complete.
   */
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

  /**
   * Evaluates if outside close suppression is active, and consumes (resets) it if so.
   *
   * @returns True if outside close was suppressed and has now been consumed, false otherwise.
   */
  consumeOutsideCloseSuppression(): boolean {
    if (!this.suppressNextOutsideClose) {
      return false;
    }

    this.suppressNextOutsideClose = false;
    return true;
  }

  /**
   * Closes the profile dialog and resets the suppression flag.
   */
  close(): void {
    this.selectedProfileSignal.set(null);
    this.suppressNextOutsideClose = false;
  }

  /**
   * Checks if the given user ID matches the ID of the currently authenticated user.
   *
   * @param userId - The user ID to check.
   * @returns True if it matches the current user's profile ID; otherwise false.
   */
  private isOwnProfile(userId: string): boolean {
    return this.authService.currentUserProfile()?.id === userId;
  }
}