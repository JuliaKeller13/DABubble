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

export class MainComponent implements OnInit {
  isSidebarClosed = false;
  private isInitialLoad = true;
  
  public threadSvc = inject(ThreadService);
  private router = inject(Router);

  
  ngOnInit() {
    this.checkScreenSize();
  }

  
  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  
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

  
  onSidebarToggle(isClosed: boolean) {
    this.isSidebarClosed = isClosed;
    if (window.innerWidth <= 1440) {
      if (!isClosed) {
        this.threadSvc.closeThread();
      }
    }
  }

  
  onHeaderBack() {
    if (this.threadSvc.isThreadOpen()) {
      this.threadSvc.closeThread();
    } else {
      this.onSidebarToggle(false);
    }
  }
}