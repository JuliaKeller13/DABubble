import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { HeaderComponent } from '../../components/header/header';

@Component({
  selector: 'app-datenschutz',
  imports: [HeaderComponent],
  templateUrl: './datenschutz.html',
  styleUrl: './datenschutz.scss'
})
export class DatenschutzComponent {
  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}
