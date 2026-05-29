import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { LandingLayoutComponent } from '../../components/landing-layout/landing-layout';

@Component({
  selector: 'app-impressum',
  imports: [LandingLayoutComponent],
  templateUrl: './impressum.html',
  styleUrl: './impressum.scss'
})
export class ImpressumComponent {
  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}
