import { Component, Output, EventEmitter, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

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

  // Emits close event to close the dialog
  onClose() {
    this.close.emit();
  }

  // Emits close event to leave the channel and close details
  onLeaveChannel() {
    this.close.emit();
  }

  // Enters edit mode for the channel name
  onEditName() {
    this.isEditingName = true;
    this.editNameValue = this.activeChannel()?.name || '';
  }

  // Saves the edited channel name to Supabase database
  async saveName() {
    const active = this.activeChannel();
    if (active && active.id && this.editNameValue.trim()) {
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
    if (active && active.id) {
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
    if (active && active.id) {
      try {
        await this.channelSvc.deleteChannel(active.id);
        this.close.emit();
      } catch (error) {
        console.error('Failed to delete channel:', error);
      }
    }
  }
}
