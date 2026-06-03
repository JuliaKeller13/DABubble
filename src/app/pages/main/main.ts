import { Component, HostListener, OnInit, inject  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from "../../components/header/header";
import { SidebarComponent } from "../../components/sidebar/sidebar";
import { ChatAreaComponent } from "../../components/chat-area/chat-area";
import { ThreadViewComponent } from "../../components/thread-view/thread-view";
import { ThreadService } from '../../services/thread.service';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, ChatAreaComponent, ThreadViewComponent],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})

export class MainComponent implements OnInit {
  isSidebarClosed = false;
  
  // Inject the shared thread service
  public threadSvc = inject(ThreadService);

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
      this.threadSvc.closeThread(); // Close thread automatically on smaller viewports
    } else {
      this.isSidebarClosed = false;
      this.threadSvc.closeThread(); // Keep thread closed by default
    }
  }

  // Handles sidebar toggle actions and coordinates thread panel visibility
  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
    if (window.innerWidth <= 1440) {
      if (!isClosed) {
        this.threadSvc.closeThread();
      }
    }
  }

  // Handles header back button clicks
  onHeaderBack() {
    if (this.threadSvc.isThreadOpen()) {
      this.threadSvc.closeThread();
    } else {
      this.onSidebarToggle(false);
    }
  }
}