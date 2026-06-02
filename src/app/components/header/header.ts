import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SearchBarComponent } from "../searchbar/searchbar";
import { ProfileMenuComponent } from "../profile-menu/profile-menu";
import { Signup } from '../signup/signup';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [SearchBarComponent, ProfileMenuComponent, Signup],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent {
  @Input() showSearch = true;
  @Input() showProfile = true;
  @Input() showSignup = false;
  @Input() isTransparent = false;
  @Input() loginHeader = false;
  @Input() isSidebarClosed = false;
  @Output() backToSidebar = new EventEmitter<void>();

  goBack() {
    this.backToSidebar.emit();
  }
}
