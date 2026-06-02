import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { HeaderComponent } from '../../components/header/header';

@Component({
  selector: 'app-impressum',
  imports: [HeaderComponent],
  templateUrl: './impressum.html',
  styleUrl: './impressum.scss'
})
export class ImpressumComponent {
  private location = inject(Location);

  // Navigates back to the previous page in history
  goBack(): void {
    this.location.back();
  }
}
