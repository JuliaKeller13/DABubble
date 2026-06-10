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
/**
 * Header component representing the main top navigation/header bar of the application.
 */
export class HeaderComponent {
  /**
   * Determines whether the search bar should be displayed in the header.
   */
  @Input() showSearch = true;

  /**
   * Determines whether the profile menu dropdown/button should be displayed in the header.
   */
  @Input() showProfile = true;

  /**
   * Determines whether the sign-up component/link should be displayed in the header.
   */
  @Input() showSignup = false;

  /**
   * Determines if the header background should be transparent instead of themed.
   */
  @Input() isTransparent = false;

  /**
   * Specifies if this header is being used specifically for the login/auth flow.
   */
  @Input() loginHeader = false;

  /**
   * Indicates if the workspace/channel sidebar is currently closed.
   */
  @Input() isSidebarClosed = false;

  /**
   * Event emitted when the user triggers a 'go back' navigation action to open or focus the sidebar.
   */
  @Output() backToSidebar = new EventEmitter<void>();

  /**
   * Emits the backToSidebar event to request showing the sidebar/list view on mobile devices.
   */
  goBack() {
    this.backToSidebar.emit();
  }
}
