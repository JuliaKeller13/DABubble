import { Component, Input, inject, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageInputComponent } from '../message-input/message-input';
import { DialogChannelDetailsComponent } from '../dialog-channel-details/dialog-channel-details';
import { DialogChannelMembersComponent } from '../dialog-channel-members/dialog-channel-members';
import { channelService } from '../../services/channel.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { userService } from '../../services/user.service';
import { firstValueFrom } from 'rxjs';

interface ChannelMember {
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [
    CommonModule,
    MessageInputComponent,
    DialogChannelDetailsComponent,
    DialogChannelMembersComponent,
    MatDialogModule
  ],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss'
})
export class ChatAreaComponent {
  @Input() isSidebarClosed = false;
  isChannelDetailsOpen = false;
  isChannelMembersOpen = false;

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private dialog = inject(MatDialog);

  // Expose active channel from the shared service
  activeChannel = this.channelSvc.activeChannel;

  members = signal<ChannelMember[]>([]);

  // Listens to active channel changes and loads its members from Supabase
  constructor() {
    effect(async () => {
      const channel = this.activeChannel();
      if (channel && channel.id) {
        try {
          const dbMembers = await this.channelSvc.getChannelMembers(channel.id);
          this.members.set(dbMembers.map(user => ({
            name: user.display_name,
            avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
          })));
        } catch (error) {
          console.error('Error loading channel members:', error);
          this.members.set([]);
        }
      } else {
        this.members.set([]);
      }
    });
  }

  // Returns the first three members of the active channel to display as avatars
  get visibleMembers(): ChannelMember[] {
    return this.members().slice(0, 3);
  }

  // Returns the total number of members in the active channel
  get memberCount(): number {
    return this.members().length;
  }

  // Opens the channel details dialog view
  openChannelDetails() {
    this.isChannelDetailsOpen = true;
  }

  // Closes the channel details dialog view
  closeChannelDetails() {
    this.isChannelDetailsOpen = false;
  }

  channelMembersInitialView: 'members' | 'add' = 'members';
  channelMembersPosition: 'right-110' | 'right-50' = 'right-110';

  // Opens the channel members list dialog
  openChannelMembers() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'members';
    this.channelMembersPosition = 'right-110';
  }

  // Closes the channel members dialog
  closeChannelMembers() {
    this.isChannelMembersOpen = false;
  }

  // Opens the members dialog directly on the add-member sub-view
  async onAddMember() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'add';
    this.channelMembersPosition = 'right-50';
  }

  // Adds selected members to the channel and refreshes the member list
  async onMembersAdded(memberResult: any) {
    if (!memberResult) return;
    
    const active = this.activeChannel();
    if (!active || !active.id) return;

    try {
      let memberIds: string[] = [];
      if (memberResult.selectionType === 'all') {
        const allUsers = await this.userSvc.getAllUsers();
        memberIds = allUsers.map(u => u.id);
      } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
        memberIds = memberResult.selectedUsers;
      }

      if (memberIds.length > 0) {
        await this.channelSvc.addMembersToChannel(active.id, memberIds);
        
        // Reload channel members list in chat-area
        const dbMembers = await this.channelSvc.getChannelMembers(active.id);
        this.members.set(dbMembers.map(user => ({
          name: user.display_name,
          avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
        })));
      }
    } catch (error) {
      console.error('Error adding members in chat area:', error);
    }
  }
}
