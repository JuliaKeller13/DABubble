import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header';
import { FooterComponent } from '../../components/footer/footer';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

type SignupData = {
  name: string;
  email: string;
  password: string;
};

@Component({
  selector: 'app-choose-avatar',
  imports: [HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './choose-avatar.html',
  styleUrl: './choose-avatar.scss'
})
export class ChooseAvatar {
  private router = inject(Router);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(false);
  private signupData: SignupData | null = null;

  constructor() {
    const state = history.state?.signupData as Partial<SignupData> | undefined;

    if (state?.name && state?.email && state?.password) {
      this.signupData = {
        name: state.name,
        email: state.email,
        password: state.password,
      };
      return;
    }

    this.toast.show('Bitte zuerst die Registrierungsdaten ausfuellen.', 'error');
    this.router.navigate(['/signup']);
  }

  async completeSignup(): Promise<void> {
    if (!this.signupData) {
      this.toast.show('Bitte zuerst die Registrierungsdaten ausfuellen.', 'error');
      this.router.navigate(['/signup']);
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.signupData;
    const { error } = await this.authService.signup(name, email, password);
    this.loading.set(false);

    if (error) {
      this.toast.show('Registrierung fehlgeschlagen: ' + (error.message || error), 'error');
      return;
    }

    this.toast.show('Konto erfolgreich erstellt!', 'success');
    this.router.navigate(['/login']);
  }
}