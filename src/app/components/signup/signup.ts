import { Component } from '@angular/core';

@Component({
  selector: 'app-signup',
  standalone: true,
  templateUrl: './signup.html',
  styleUrl: './signup.scss'
})
export class Signup {
  onSignup() {
    // Hier später Logik für Registrierung einfügen
    alert('Signup clicked!');
  }
}
