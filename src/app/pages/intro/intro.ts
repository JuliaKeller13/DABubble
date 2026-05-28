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

  ngOnInit(): void {
    // Wait for the animation to complete (1300ms) + 5 seconds, then navigate to login
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 6300);
  }
}
