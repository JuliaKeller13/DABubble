import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-intro',
  imports: [],
  templateUrl: './intro.html',
  styleUrl: './intro.scss'
})
export class IntroComponent implements OnInit {
  private router = inject(Router);

  // Redirects the user to the login screen after a brief delay
  ngOnInit(): void {
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3500);
  }
}
