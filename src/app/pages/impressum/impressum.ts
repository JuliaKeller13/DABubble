import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-impressum',
  templateUrl: './impressum.html',
  styleUrl: './impressum.scss'
})
export class ImpressumComponent {
  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}
