import { Component, Input } from '@angular/core';
import { SearchBarComponent } from "../searchbar/searchbar";

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [SearchBarComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent {
  @Input() showSearch = true;
}
