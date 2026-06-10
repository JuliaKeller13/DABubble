import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast';
import { AuthRedirectToastService } from './services/auth-redirect-toast.service';
import { DialogProfileOverlayComponent } from './components/dialog-profile/dialog-profile-overlay';
import { EmojiPickerHostComponent } from './components/emoji-picker-host/emoji-picker-host';

/**
 * Root component of the DABubble application.
 * Handles the main initialization, routing outlets, and global overlays.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, DialogProfileOverlayComponent, EmojiPickerHostComponent],
  templateUrl: './app.html'
})
export class App {
  /**
   * Service responsible for handling redirect toasts after authentication processes.
   */
  private readonly authRedirectToast = inject(AuthRedirectToastService);

  /**
   * Title of the application.
   */
  title = 'DABubble';

  /**
   * Initializes the root component.
   * Triggers the handling of Google login success redirect notifications.
   */
  constructor() {
    this.authRedirectToast.handleGoogleLoginSuccess();
  }
}
