import { Component } from '@angular/core';
import { HeaderComponent } from "../../components/header/header";
import { SidebarComponent } from "../../components/sidebar/sidebar";

@Component({
  selector: 'app-main',
  imports: [HeaderComponent, SidebarComponent],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})
export class MainComponent {
  isSidebarClosed = false;

  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
  }
}
