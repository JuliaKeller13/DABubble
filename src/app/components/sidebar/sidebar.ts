import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { MatDialog, MatDialogModule, MatDialogConfig } from '@angular/material/dialog';
import { dialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';

// Get dialog configuration based on responsive viewport width
export function getResponsiveDialogConfig(config: MatDialogConfig, type: 'full-screen' | 'bottom-sheet'): MatDialogConfig {
  const isMobile = window.innerWidth <= 767;
  if (!isMobile) return config;

  if (type === 'full-screen') {
    return {
      ...config,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      position: { top: '0px', left: '0px' }
    };
  } else {
    return {
      ...config,
      width: '100vw',
      height: 'auto',
      minHeight: 'auto',
      maxWidth: '100vw',
      maxHeight: 'auto',
      position: { bottom: '0px' }
    };
  }
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent implements OnInit {
  @Output() toggleSidebar = new EventEmitter<boolean>();
  @Input() isClosed = false;

  isChannelsExpanded = true;
  isDMsExpanded = true;

  private channelSvc = inject(channelService);
  activeChannel = this.channelSvc.activeChannel;
  private userSvc = inject(userService);
  private authSvc = inject(AuthService);
  private dialog = inject(MatDialog);

  channels = this.channelSvc.channels;
  users = signal<User[]>([]);

  // Initialize component and load initial data
  async ngOnInit() {
    await this.loadData();
  }

  // Fetch channels and users from services
  async loadData() {
    const fetchedChannels = await this.channelSvc.loadChannels();
    
    if (fetchedChannels.length > 0 && !this.activeChannel()) {
      this.channelSvc.selectChannel(fetchedChannels[0]);
    }

    const fetchedUsers = await this.userSvc.getAllUsers();
    this.users.set(fetchedUsers);
  }

  // Check if a user is currently online
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  // Set the active channel and close the sidebar on mobile/tablet viewports
  selectChannel(id: string | undefined) {
    if (!id) return;
    const channel = this.channels().find(c => c.id === id) || null;
    this.channelSvc.selectChannel(channel);

    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  // Set the active DM user and close the sidebar on mobile/tablet viewports
  selectUser(id: string | undefined) {
    if (!id) return;
    // Currently, we close the sidebar on mobile/tablet screens to open the chat area
    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  // Expand or collapse the channels list
  toggleChannels() {
    this.isChannelsExpanded = !this.isChannelsExpanded;
  }

  // Expand or collapse the direct messages list
  toggleDMs() {
    this.isDMsExpanded = !this.isDMsExpanded;
  }

  // Expand or collapse the sidebar
  toggleOpenClosed() {
    this.isClosed = !this.isClosed;
    this.toggleSidebar.emit(this.isClosed);
  }

  // Handle the sequential channel creation dialog flow
  async openCreateChannelDialog(): Promise<void> {
    const dialogRef = this.dialog.open(
      dialogCreateChannelComponent,
      getResponsiveDialogConfig(
        {
          width: '870px',
          height: '540px',
          panelClass: 'create-channel-dialog-container'
        },
        'full-screen'
      )
    );

    dialogRef.componentInstance.channelSaved.subscribe(async (result) => {
      const addMemberRef = this.dialog.open(
        dialogAddMemberComponent,
        getResponsiveDialogConfig(
          {
            width: '500px',
            minHeight: '290px',
            maxWidth: '100vw',
            maxHeight: '90vh',
            panelClass: ['custom-dialog-container', 'add-member-dialog-container'],
            data: { channelName: result.name }
          },
          'bottom-sheet'
        )
      );

      const memberResult = await firstValueFrom(addMemberRef.afterClosed());
      if (memberResult) {
        try {
          const currentUserId = this.authSvc.currentUser()?.id;
          
          // Create the channel in the database
          const createdChannels = await this.channelSvc.createChannel({
            name: result.name,
            description: result.description,
            created_by: currentUserId ?? ''
          });
          
          // If members were selected, add them to the channel
          const active = createdChannels?.[0];
          if (active && active.id) {
            let memberIds: string[] = [];
            if (memberResult.selectionType === 'all') {
              const allUsers = await this.userSvc.getAllUsers();
              memberIds = allUsers.map(u => u.id);
            } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
              memberIds = memberResult.selectedUsers;
            }

            if (memberIds.length > 0) {
              await this.channelSvc.addMembersToChannel(active.id, memberIds);
            }
          }

          await this.loadData();
          dialogRef.close();
        } catch (error) {
          console.error('Failed to create channel:', error);
        }
      }
    });
  }

}