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

  ngOnInit() {
    this.checkScreenSize();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    if (window.innerWidth < 1430) {
      this.isSidebarClosed = true;
      this.isThreadOpen = true;
    } else {
      this.isThreadOpen = true;
    }
  }

  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
    if (window.innerWidth < 1430) {
      if (!isClosed) {
        this.isThreadOpen = false;
      } else {
        this.isThreadOpen = true;
      }
    }
  }
}
