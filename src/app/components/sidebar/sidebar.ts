import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { dialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';

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
  activeChannelId = '';

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private authSvc = inject(AuthService);
  private dialog = inject(MatDialog);

  channels = signal<Channel[]>([]);
  users = signal<User[]>([]);

  async ngOnInit() {
    await this.loadData();
  }

  // Load channels and users from Supabase
  async loadData() {
    const fetchedChannels = await this.channelSvc.getChannels();
    this.channels.set(fetchedChannels);
    
    if (fetchedChannels.length > 0) {
      this.activeChannelId = fetchedChannels[0].id || '';
    }

    const fetchedUsers = await this.userSvc.getAllUsers();
    this.users.set(fetchedUsers);
  }

  // Set active channel
  selectChannel(id: string | undefined) {
    if (!id) return;
    this.activeChannelId = id;
  }

  // Toggle channel list
  toggleChannels() {
    this.isChannelsExpanded = !this.isChannelsExpanded;
  }

  // Toggle DM list
  toggleDMs() {
    this.isDMsExpanded = !this.isDMsExpanded;
  }

  // Toggle sidebar open or closed
  toggleOpenClosed() {
    this.isClosed = !this.isClosed;
    this.toggleSidebar.emit(this.isClosed);
  }

  // Open create channel dialog
  openCreateChannelDialog(): void {
    const dialogRef = this.dialog.open(dialogCreateChannelComponent, {
      width: '870px',
      height: '540px',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        const addMemberRef = this.dialog.open(dialogAddMemberComponent, {
          width: '710px',
          height: '290px',
          maxWidth: '100vw',
          maxHeight: '100vh',
          panelClass: 'custom-dialog-container',
          data: { channelName: result.name }
        });

        addMemberRef.afterClosed().subscribe(async (memberResult) => {
          if (memberResult) {
            try {
              const currentUserId = this.authSvc.currentUser()?.id;
              await this.channelSvc.createChannel({
                name: result.name,
                description: result.description,
                created_by: currentUserId ?? ''
              });
              await this.loadData();
            } catch (error) {
              console.error('Failed to create channel:', error);
            }
          }
        });
      }
    });
  }

}