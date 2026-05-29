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

  goBack(): void {
    this.location.back();
  }
}
