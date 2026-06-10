import { Component, OnInit, signal, output } from '@angular/core';

@Component({
  selector: 'app-intro',
  imports: [],
  templateUrl: './intro.html',
  styleUrl: './intro.scss'
})
/**
 * Component displaying the introductory animation sequence when the application starts.
 * It coordinates slide-in/fade animations and notifies the parent when the sequence finishes.
 */
export class IntroComponent implements OnInit {
  /** Output event that fires once the introductory animation sequence has completed. */
  finished = output<void>();

  /** Signal indicating whether the slide animation is active. */
  isSliding = signal(false);
  /** Signal indicating whether the background has faded out. */
  backgroundFaded = signal(false);

  /**
   * Lifecycle hook that schedules animation phases.
   * Activates sliding and fading states, then emits the finished event when complete.
   */
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
