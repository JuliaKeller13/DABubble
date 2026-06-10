import { Component, HostListener, OnInit, inject  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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

/**
 * Main component representing the application's workspace layout.
 * It manages the responsive state of the sidebar, chat area, and thread view
 * based on screen width and route state.
 */
export class MainComponent implements OnInit {
  /** Indicates whether the sidebar is currently closed. */
  isSidebarClosed = false;
  /** Flag to track if the component is loaded for the first time, used for initial layout setup. */
  private isInitialLoad = true;
  
  /** Service to manage state and actions for the message thread view. */
  public threadSvc = inject(ThreadService);
  /** Angular Router to read and check current active route path names. */
  private router = inject(Router);

  /**
   * Lifecycle hook that executes after component initialization.
   * Performs the initial screen size check.
   */
  ngOnInit() {
    this.checkScreenSize();
  }

  /**
   * Host listener for window resize events.
   * Updates the responsive layout settings whenever the screen size changes.
   */
  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  /**
   * Evaluates screen width and route state to determine the visibility of the sidebar
   * and thread view. Ensures an optimal user experience across mobile, tablet, and desktop viewports.
   */
  private checkScreenSize() {
    const width = window.innerWidth;
    const isChatActive = this.router.url.includes('/main/channel/') || 
                         this.router.url.includes('/main/dm/') || 
                         this.router.url.includes('/main/new-message');

    if (this.isInitialLoad) {
      this.isInitialLoad = false;
      if (width <= 1024) {
        this.isSidebarClosed = isChatActive; 
      } else if (width <= 1440) {
        this.isSidebarClosed = true;  
      } else {
        this.isSidebarClosed = false; 
      }
      this.threadSvc.closeThread();
      return;
    }

    
    if (width <= 1024) {
      
      return;
    }

    if (width <= 1440) {
      this.isSidebarClosed = true;
      this.threadSvc.closeThread(); 
    } else {
      this.isSidebarClosed = false;
      this.threadSvc.closeThread(); 
    }
  }

  /**
   * Handles toggle actions from the sidebar.
   * Updates the sidebar closed state and closes the thread if screen width requires it.
   * 
   * @param isClosed - Indicates whether the sidebar should be closed.
   */
  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
    if (window.innerWidth <= 1440) {
      if (!isClosed) {
        this.threadSvc.closeThread();
      }
    }
  }

  /**
   * Handles back actions initiated from the header.
   * Closes the active thread if open, or reopens the sidebar if the thread is already closed.
   */
  onHeaderBack() {
    if (this.threadSvc.isThreadOpen()) {
      this.threadSvc.closeThread();
    } else {
      this.onSidebarToggle(false);
    }
  }
}