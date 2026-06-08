import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { authService } from '../../services/auth.service';
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
  readonly menuIconMasks = {
    profile: "url('img/icons/account_workspace/account_circle.svg')",
    logout: "url('img/icons/account_workspace/logout.svg')",
  };
  authService = inject(authService);

  currentUserProfile = this.authService.currentUserProfile;
  selectedProfile = this.profileDialogSvc.selectedProfile;
  isCurrentUserProfile = this.profileDialogSvc.isCurrentUserProfile;
  isOpen = false;
  isClosing = false;
  viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  
  touchStartY = 0;
  isDragging = false;
  currentTranslateY = 0;

  constructor(private elementRef: ElementRef) {}

  toggleMenu(event: Event) {
    event.stopPropagation();
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.isOpen = true;
      this.isClosing = false;
    }
  }

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

  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    this.isDragging = true;
  }

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

  onTouchEnd(_event: TouchEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.currentTranslateY > 80) {
      this.closeMenu();
    }
    this.currentTranslateY = 0;
  }

  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.handleOutsideClick();
    }
  }

  private handleOutsideClick(): void {
    if (this.showMobileSelfProfileDialog()) return;
    if (this.isOpen) this.closeMenu();
    if (this.showDesktopSelfProfileDialog() && !this.profileDialogSvc.consumeOutsideCloseSuppression()) {
      this.closeProfileDialog();
    }
  }

  
  @HostListener('window:resize')
  onResize() {
    this.viewportWidth = window.innerWidth;
    this.isOpen = false;
    this.isClosing = false;
  }

  
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

  
  isOnline(): boolean {
    const profile = this.currentUserProfile();
    return profile ? this.authService.onlineUserIds().has(profile.id) : false;
  }

  
  async logout() {
    this.closeMenu();
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
