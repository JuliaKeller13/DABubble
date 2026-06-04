import { Component, HostListener, inject } from '@angular/core';
import { DialogProfileComponent } from './dialog-profile';
import { ProfileDialogService } from '../../services/profile-dialog.service';

@Component({
  selector: 'app-dialog-profile-overlay',
  imports: [DialogProfileComponent],
  templateUrl: './dialog-profile-overlay.html',
  styleUrl: './dialog-profile-overlay.scss',
})
export class DialogProfileOverlayComponent {
  readonly profileDialogSvc: ProfileDialogService = inject(ProfileDialogService);
  viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;

  @HostListener('window:resize')
  onResize(): void {
    this.viewportWidth = window.innerWidth;
  }

  showSelfProfileOverlay(): boolean {
    return this.viewportWidth <= 1024 && this.profileDialogSvc.isCurrentUserProfile();
  }

  showOtherProfileOverlay(): boolean {
    return !this.profileDialogSvc.isCurrentUserProfile();
  }

  closeProfileDialog(): void {
    this.profileDialogSvc.close();
  }

  stopProfileDialogClose(event: MouseEvent): void {
    event.stopPropagation();
  }
}