import { Component, Output, EventEmitter, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
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
  private authSvc = inject(authService);
  private profileDialogSvc = inject(ProfileDialogService);
  private router = inject(Router);

  
  isUserOnline(member: any): boolean {
    return this.authSvc.onlineUserIds().has(member.id);
  }

  activeChannel = this.channelSvc.activeChannel;
  creatorName = signal<string>('Laden...');

  isEditingName = false;
  isEditingDescription = false;
  editNameValue = '';
  editDescriptionValue = '';

  
  async ngOnInit() {
    const creatorId = this.activeChannel()?.created_by;
    if (creatorId) {
      
      const creator = await this.userSvc.getUserById(creatorId);
      this.creatorName.set(creator ? creator.display_name : 'Unbekannt');
    }
  }

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  
  onClose() {
    this.close.emit();
  }

  
  async onLeaveChannel() {
    const active = this.activeChannel();
    const currentUserId = this.currentUserId;
    if (active && active.id && currentUserId) {
      try {
        await this.channelSvc.removeMemberFromChannel(active.id, currentUserId);
        await this.channelSvc.loadChannels();
        this.navigateToRemainingOrMain();
        this.close.emit();
      } catch (error) {
        console.error('Failed to leave channel:', error);
      }
    }
  }

  
  onEditName() {
    this.isEditingName = true;
    this.editNameValue = this.activeChannel()?.name || '';
  }

  
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

  
  onEditDescription() {
    this.isEditingDescription = true;
    this.editDescriptionValue = this.activeChannel()?.description || '';
  }

  
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

  
  async onDeleteChannel() {
    const active = this.activeChannel();
    if (active && active.id && active.created_by === this.currentUserId) {
      try {
        await this.channelSvc.deleteChannel(active.id);
        this.navigateToRemainingOrMain();
        this.close.emit();
      } catch (error) {
        console.error('Failed to delete channel:', error);
      }
    }
  }

  private navigateToRemainingOrMain(): void {
    const remaining = this.channelSvc.channels();
    if (remaining.length > 0) {
      this.router.navigate(['/main/channel', remaining[0].id]);
    } else {
      this.router.navigate(['/main']);
    }
  }

  async openMemberProfile(memberId: string): Promise<void> {
    await this.profileDialogSvc.openById(memberId, { suppressOutsideCloseOnce: true });
  }
}
