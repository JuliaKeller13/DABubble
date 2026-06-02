import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from "../../components/header/header";
import { SidebarComponent } from "../../components/sidebar/sidebar";
import { ChatAreaComponent } from "../../components/chat-area/chat-area";
import { ThreadViewComponent } from "../../components/thread-view/thread-view";

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, ChatAreaComponent, ThreadViewComponent],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})
export class MainComponent implements OnInit {
  isSidebarClosed = false;
  isThreadOpen = true;

  // Performs initial screen size checks on component initialization
  ngOnInit() {
    this.checkScreenSize();
  }

  // Reacts to browser viewport resize events
  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  // Adjusts sidebar and thread visibility flags based on viewport width
  private checkScreenSize() {
    if (window.innerWidth <= 1440) {
      this.isSidebarClosed = true;
      this.isThreadOpen = true;
    } else {
      this.isSidebarClosed = false;
      this.isThreadOpen = true;
    }
  }

  // Handles sidebar toggle actions and coordinates thread panel visibility
  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
    if (window.innerWidth <= 1440) {
      if (!isClosed) {
        this.isThreadOpen = false;
      } else {
        this.isThreadOpen = true;
      }
    }
  }
}
