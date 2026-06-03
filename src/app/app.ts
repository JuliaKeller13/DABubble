import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast';
import { AuthRedirectToastService } from './services/auth-redirect-toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly authRedirectToast = inject(AuthRedirectToastService);

  title = 'DABubble';

  constructor() {
    this.authRedirectToast.handleGoogleLoginSuccess();
  }
}
