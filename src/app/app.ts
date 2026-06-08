import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast';
import { AuthRedirectToastService } from './services/auth-redirect-toast.service';
import { DialogProfileOverlayComponent } from './components/dialog-profile/dialog-profile-overlay';
import { EmojiPickerHostComponent } from './components/emoji-picker-host/emoji-picker-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, DialogProfileOverlayComponent, EmojiPickerHostComponent],
  templateUrl: './app.html'
})
export class App {
  private readonly authRedirectToast = inject(AuthRedirectToastService);

  title = 'DABubble';

  constructor() {
    this.authRedirectToast.handleGoogleLoginSuccess();
  }
}
