import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { authService } from '../../services/auth.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { DialogProfileComponent } from '../dialog-profile/dialog-profile';
import { TruncatePipe } from '../../pipes/truncate.pipe';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [DialogProfileComponent, TruncatePipe],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
})
/**
 * Component that renders and manages the user profile menu dropdown/bottom sheet and its interactions.
 */
export class ProfileMenuComponent {
  /**
   * Router service used for navigation, e.g., redirecting on logout.
   */
  private router = inject(Router);

  /**
   * Service managing the profile dialog state and visibility.
   */
  readonly profileDialogSvc = inject(ProfileDialogService);

  /**
   * SVG mask urls used for the menu option icons.
   */
  readonly menuIconMasks = {
    profile: "url('img/icons/account_workspace/account_circle.svg')",
    logout: "url('img/icons/account_workspace/logout.svg')",
  };

  /**
   * Service providing authentication state and operations.
   */
  authService = inject(authService);

  /**
   * Signal mapping the currently logged-in user profile.
   */
  currentUserProfile = this.authService.currentUserProfile;

  /**
   * Signal representing the user profile currently loaded in the profile dialog.
   */
  selectedProfile = this.profileDialogSvc.selectedProfile;

  /**
   * Signal indicating if the selected profile in the dialog is the current user's profile.
   */
  isCurrentUserProfile = this.profileDialogSvc.isCurrentUserProfile;

  /**
   * Boolean flag indicating if the profile dropdown menu is open.
   */
  isOpen = false;

  /**
   * Boolean flag indicating if the menu is in the process of closing (used for mobile animations).
   */
  isClosing = false;

  /**
   * Current width of the viewport used for responsiveness and layout decisions.
   */
  viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  
  /**
   * Y-coordinate where a touch gesture started, used for swipe-to-close behavior on mobile.
   */
  touchStartY = 0;

  /**
   * Boolean flag indicating if the user is dragging the bottom sheet menu.
   */
  isDragging = false;

  /**
   * The translation offset in pixels when dragging the menu down.
   */
  currentTranslateY = 0;

  /**
   * Constructs the profile menu component.
   * 
   * @param elementRef Reference to the component's host element.
   */
  constructor(private elementRef: ElementRef) {}

  /**
   * Toggles the open state of the profile dropdown menu. Prevents click event propagation.
   * 
   * @param event The click event.
   */
  toggleMenu(event: Event) {
    event.stopPropagation();
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.isOpen = true;
      this.isClosing = false;
    }
  }

  /**
   * Closes the profile menu, with support for closing animation on mobile viewports.
   */
  closeMenu() {
    if (!this.isOpen || this.isClosing) return;

    if (window.innerWidth <= 1024) {
      this.isClosing = true;
      setTimeout(() => {
        this.isOpen = false;
        this.isClosing = false;
      }, 250);
    } else {
      this.isOpen = false;
    }
  }

  /**
   * Handles the start of a touch event, recording the initial Y position for touch swipe-to-close.
   * 
   * @param event The touch event.
   */
  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    this.isDragging = true;
  }

  /**
   * Handles the move phase of a touch event. Computes drag distance to translate the menu.
   * 
   * @param event The touch event.
   */
  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    const currentY = event.touches[0].clientY;
    const deltaY = currentY - this.touchStartY;
    if (deltaY > 0) {
      this.currentTranslateY = deltaY;
    } else {
      this.currentTranslateY = 0;
    }
  }

  /**
   * Handles the end of a touch event. Closes the menu if drag distance exceeds threshold.
   * 
   * @param _event The touch event.
   */
  onTouchEnd(_event: TouchEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.currentTranslateY > 80) {
      this.closeMenu();
    }
    this.currentTranslateY = 0;
  }

  /**
   * Host listener to capture document click events. Closes the dropdown menu/dialog if clicked outside.
   * 
   * @param event The mouse click event.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.handleOutsideClick();
    }
  }

  /**
   * Internal helper method to handle clicks outside the menu component.
   */
  private handleOutsideClick(): void {
    if (this.showMobileSelfProfileDialog()) return;
    if (this.isOpen) this.closeMenu();
    if (this.showDesktopSelfProfileDialog() && !this.profileDialogSvc.consumeOutsideCloseSuppression()) {
      this.closeProfileDialog();
    }
  }

  /**
   * Host listener for window resize events. Updates viewport width tracking and closes the menu.
   */
  @HostListener('window:resize')
  onResize() {
    this.viewportWidth = window.innerWidth;
    this.isOpen = false;
    this.isClosing = false;
  }

  /**
   * Opens the profile dialog for the current user and closes the dropdown menu.
   */
  openProfile() {
    const profile = this.currentUserProfile();

    if (this.viewportWidth > 1024) {
      this.closeMenu();
    }

    if (profile) {
      this.profileDialogSvc.open(profile);
    }
  }

  /**
   * Checks if the self-profile dialog should be rendered in desktop mode.
   * 
   * @returns True if in desktop mode and the user profile is active, false otherwise.
   */
  showDesktopSelfProfileDialog(): boolean {
    return this.viewportWidth > 1024 && this.isCurrentUserProfile() && !!this.selectedProfile();
  }

  /**
   * Checks if the self-profile dialog should be rendered in mobile mode.
   * 
   * @returns True if in mobile mode and the user profile is active, false otherwise.
   */
  showMobileSelfProfileDialog(): boolean {
    return this.viewportWidth <= 1024 && this.isCurrentUserProfile() && !!this.selectedProfile();
  }

  /**
   * Closes the active profile dialog.
   */
  closeProfileDialog(): void {
    this.profileDialogSvc.close();
  }

  /**
   * Checks if the current user profile's status is online.
   * 
   * @returns True if the current user is online, false otherwise.
   */
  isOnline(): boolean {
    const profile = this.currentUserProfile();
    return profile ? this.authService.onlineUserIds().has(profile.id) : false;
  }

  /**
   * Logs the user out of the application and navigates to the login screen.
   */
  async logout() {
    this.closeMenu();
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
