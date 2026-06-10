import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { HeaderComponent } from '../../components/header/header';

@Component({
  selector: 'app-datenschutz',
  imports: [HeaderComponent],
  templateUrl: './datenschutz.html',
  styleUrl: './datenschutz.scss'
})
/**
 * Component representing the privacy policy (Datenschutz) page.
 * Displays privacy information, data protection guidelines, and handles navigation back to the previous screen.
 */
export class DatenschutzComponent implements OnInit {
  /** Location service used for browser navigation and tracking history. */
  private location = inject(Location);

  /**
   * Lifecycle hook that executes on initialization.
   * Scrolls the window to the top to ensure readable presentation.
   */
  ngOnInit(): void {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
  }
  
  /**
   * Navigates back to the previously visited screen using the browser's history.
   */
  goBack(): void {
    this.location.back();
  }
}
