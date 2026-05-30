import { Component, Input } from '@angular/core';
import { SearchBarComponent } from "../searchbar/searchbar";
import { ProfileMenuComponent } from "../profile-menu/profile-menu";

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [SearchBarComponent, ProfileMenuComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent {
  @Input() showSearch = true;
  @Input() showProfile = true;
  @Input() isTransparent = false;
}
