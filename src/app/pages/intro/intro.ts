import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-intro',
  imports: [],
  templateUrl: './intro.html',
  styleUrl: './intro.scss'
})
export class IntroComponent implements OnInit {
  private router = inject(Router);

  isSliding = signal(false);
  backgroundFaded = signal(false);

  ngOnInit(): void {
    setTimeout(() => {
      this.isSliding.set(true);
      this.backgroundFaded.set(true);

      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 850);
    }, 2800);
  }
}
