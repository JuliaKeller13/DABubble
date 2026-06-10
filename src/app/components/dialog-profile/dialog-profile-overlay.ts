import { Component, HostListener, inject } from '@angular/core';
import { DialogProfileComponent } from './dialog-profile';
import { ProfileDialogService } from '../../services/profile-dialog.service';

@Component({
  selector: 'app-dialog-profile-overlay',
  imports: [DialogProfileComponent],
  templateUrl: './dialog-profile-overlay.html',
  styleUrl: './dialog-profile-overlay.scss',
})
/**
 * Component representing the overlay container for a user's profile dialog.
 * Adapts layout according to screen sizes and controls overall opening/closing behavior.
 */
export class DialogProfileOverlayComponent {
  /**
   * Service controlling profile dialog display state and loading.
   * @readonly
   */
  readonly profileDialogSvc: ProfileDialogService = inject(ProfileDialogService);
  /**
   * The current width of the viewport. Defaults to 1280 if window is undefined (e.g. during SSR).
   */
  viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;

  /**
   * Host listener responding to window resize events to update the viewport width.
   */
  @HostListener('window:resize')
  onResize(): void {
    this.viewportWidth = window.innerWidth;
  }

  /**
   * Determines if the current user profile overlay should be visible.
   * Only shown on screens smaller than or equal to 1024px width.
   * @returns True if current user profile overlay should be displayed.
   */
  showSelfProfileOverlay(): boolean {
    return this.viewportWidth <= 1024 && this.profileDialogSvc.isCurrentUserProfile();
  }

  /**
   * Determines if another user's profile overlay should be visible.
   * @returns True if another user profile overlay should be displayed.
   */
  showOtherProfileOverlay(): boolean {
    return !this.profileDialogSvc.isCurrentUserProfile();
  }

  /**
   * Closes the profile overlay dialog.
   */
  closeProfileDialog(): void {
    this.profileDialogSvc.close();
  }

  /**
   * Stops click events from propagating to prevent automatic closing of the overlay when clicking inside the dialog box.
   * @param event The mouse click event.
   */
  stopProfileDialogClose(event: MouseEvent): void {
    event.stopPropagation();
  }
}