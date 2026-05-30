import { Component } from '@angular/core';
import { HeaderComponent } from "../../components/header/header";
import { SidebarComponent } from "../../components/sidebar/sidebar";
import { ChatAreaComponent } from "../../components/chat-area/chat-area";
import { ThreadViewComponent } from "../../components/thread-view/thread-view";

@Component({
  selector: 'app-main',
  imports: [HeaderComponent, SidebarComponent, ChatAreaComponent, ThreadViewComponent],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})
export class MainComponent {
  isSidebarClosed = false;

  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
  }
}
