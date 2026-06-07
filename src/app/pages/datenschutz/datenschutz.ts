import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { HeaderComponent } from '../../components/header/header';

@Component({
  selector: 'app-datenschutz',
  imports: [HeaderComponent],
  templateUrl: './datenschutz.html',
  styleUrl: './datenschutz.scss'
})
export class DatenschutzComponent implements OnInit {
  private location = inject(Location);

  ngOnInit(): void {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
  }
  
  goBack(): void {
    this.location.back();
  }
}
