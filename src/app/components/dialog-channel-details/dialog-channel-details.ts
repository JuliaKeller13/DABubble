import { Component, Output, EventEmitter, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';

@Component({
  selector: 'app-dialog-channel-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dialog-channel-details.html',
  styleUrl: './dialog-channel-details.scss'
})
export class DialogChannelDetailsComponent implements OnInit {
  @Input() isSidebarClosed = false;
  @Input() members: any[] = [];
  @Output() close = new EventEmitter<void>();

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private authSvc = inject(AuthService);
  private profileDialogSvc = inject(ProfileDialogService);

  // Check if a user is currently online
  isUserOnline(member: any): boolean {
    return this.authSvc.onlineUserIds().has(member.id);
  }

  activeChannel = this.channelSvc.activeChannel;
  creatorName = signal<string>('Laden...');

  isEditingName = false;
  isEditingDescription = false;
  editNameValue = '';
  editDescriptionValue = '';

  // Fetches creator information on component initialization
  async ngOnInit() {
    const creatorId = this.activeChannel()?.created_by;
    if (creatorId) {
      // Directly fetch the specific creator user by ID to avoid loading all users from DB
      const creator = await this.userSvc.getUserById(creatorId);
      this.creatorName.set(creator ? creator.display_name : 'Unbekannt');
    }
  }

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  // Emits close event to close the dialog
  onClose() {
    this.close.emit();
  }

  // Leave the channel in the database and local signals
  async onLeaveChannel() {
    const active = this.activeChannel();
    const currentUserId = this.currentUserId;
    if (active && active.id && currentUserId) {
      try {
        await this.channelSvc.removeMemberFromChannel(active.id, currentUserId);
        await this.channelSvc.loadChannels();

        // If the left channel was active, switch to first remaining or null
        const remaining = this.channelSvc.channels();
        if (remaining.length > 0) {
          this.channelSvc.selectChannel(remaining[0]);
        } else {
          this.channelSvc.selectChannel(null);
        }

        this.close.emit();
      } catch (error) {
        console.error('Failed to leave channel:', error);
      }
    }
  }

  // Enters edit mode for the channel name
  onEditName() {
    this.isEditingName = true;
    this.editNameValue = this.activeChannel()?.name || '';
  }

  // Saves the edited channel name to Supabase database
  async saveName() {
    const active = this.activeChannel();
    if (active && active.id && this.editNameValue.trim() && active.created_by === this.currentUserId) {
      try {
        await this.channelSvc.updateChannel(active.id, { name: this.editNameValue.trim() });
        this.isEditingName = false;
      } catch (error) {
        console.error('Failed to update channel name:', error);
      }
    }
  }

  // Enters edit mode for the channel description
  onEditDescription() {
    this.isEditingDescription = true;
    this.editDescriptionValue = this.activeChannel()?.description || '';
  }

  // Saves the edited channel description to Supabase database
  async saveDescription() {
    const active = this.activeChannel();
    if (active && active.id && active.created_by === this.currentUserId) {
      try {
        await this.channelSvc.updateChannel(active.id, { description: this.editDescriptionValue.trim() });
        this.isEditingDescription = false;
      } catch (error) {
        console.error('Failed to update channel description:', error);
      }
    }
  }

  // Deletes active channel and closes details dialog
  async onDeleteChannel() {
    const active = this.activeChannel();
    if (active && active.id && active.created_by === this.currentUserId) {
      try {
        await this.channelSvc.deleteChannel(active.id);
        this.close.emit();
      } catch (error) {
        console.error('Failed to delete channel:', error);
      }
    }
  }

  async openMemberProfile(memberId: string): Promise<void> {
    await this.profileDialogSvc.openById(memberId, { suppressOutsideCloseOnce: true });
  }
}
