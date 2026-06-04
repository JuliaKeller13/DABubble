import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { DialogProfileComponent } from '../dialog-profile/dialog-profile';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [DialogProfileComponent],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
})
export class ProfileMenuComponent {
  private router = inject(Router);
  readonly profileDialogSvc = inject(ProfileDialogService);
  authService = inject(AuthService);

  currentUserProfile = this.authService.currentUserProfile;
  selectedProfile = this.profileDialogSvc.selectedProfile;
  isCurrentUserProfile = this.profileDialogSvc.isCurrentUserProfile;
  isOpen = false;
  isClosing = false;
  viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;

  constructor(private elementRef: ElementRef) {}

  // Toggles the visibility of the profile drop-down menu
  toggleMenu(event: Event) {
    event.stopPropagation();
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.isOpen = true;
      this.isClosing = false;
    }
  }

  // Closes the profile menu with an optional fade-out delay on mobile viewports
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

  // Closes the menu when clicking outside of the component element
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      if (this.showMobileSelfProfileDialog()) {
        return;
      }

      if (this.isOpen) {
        this.closeMenu();
      }

      if (this.showDesktopSelfProfileDialog()) {
        if (this.profileDialogSvc.consumeOutsideCloseSuppression()) {
          return;
        }

        this.closeProfileDialog();
      }
    }
  }

  // Resets the menu state when the window viewport is resized
  @HostListener('window:resize')
  onResize() {
    this.viewportWidth = window.innerWidth;
    this.isOpen = false;
    this.isClosing = false;
  }

  // Closes the menu and triggers opening the user profile details view
  openProfile() {
    const profile = this.currentUserProfile();

    if (this.viewportWidth > 1024) {
      this.closeMenu();
    }

    if (profile) {
      this.profileDialogSvc.open(profile);
    }
  }

  showDesktopSelfProfileDialog(): boolean {
    return this.viewportWidth > 1024 && this.isCurrentUserProfile() && !!this.selectedProfile();
  }

  showMobileSelfProfileDialog(): boolean {
    return this.viewportWidth <= 1024 && this.isCurrentUserProfile() && !!this.selectedProfile();
  }

  closeProfileDialog(): void {
    this.profileDialogSvc.close();
  }

  // Checks if the current logged-in user is online
  isOnline(): boolean {
    const profile = this.currentUserProfile();
    return profile ? this.authService.onlineUserIds().has(profile.id) : false;
  }

  // Logs out the user, cleans up presence status, and redirects to login page
  async logout() {
    this.closeMenu();
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
