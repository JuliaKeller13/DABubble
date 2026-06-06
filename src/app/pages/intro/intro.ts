import { Component, OnInit, signal, output } from '@angular/core';

@Component({
  selector: 'app-intro',
  imports: [],
  templateUrl: './intro.html',
  styleUrl: './intro.scss'
})
export class IntroComponent implements OnInit {
  finished = output<void>();

  isSliding = signal(false);
  backgroundFaded = signal(false);

  ngOnInit(): void {
    setTimeout(() => {
      this.isSliding.set(true);
      this.backgroundFaded.set(true);

      setTimeout(() => {
        this.finished.emit();
      }, 850);
    }, 3100);
  }
}
