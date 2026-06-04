import { Component, Output, EventEmitter, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { AuthService } from '../../services/auth.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { channelService } from '../../services/channel.service';

interface ChannelMember {
  id: string;
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-dialog-channel-members',
  standalone: true,
  imports: [CommonModule, dialogAddMemberComponent],
  templateUrl: './dialog-channel-members.html',
  styleUrl: './dialog-channel-members.scss'
})
export class DialogChannelMembersComponent implements OnInit {
  @Input() isSidebarClosed = false;
  @Input() members: ChannelMember[] = [];
  @Input() channelName: string = '';
  @Input() initialView: 'members' | 'add' = 'members';
  @Input() positionClass: 'right-110' | 'right-50' = 'right-110';
  @Output() close = new EventEmitter<void>();
  @Output() addMember = new EventEmitter<any>();
  @Output() memberRemoved = new EventEmitter<string>();

  private authSvc = inject(AuthService);
  private profileDialogSvc = inject(ProfileDialogService);
  private channelSvc = inject(channelService);

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  get isCreator(): boolean {
    const active = this.channelSvc.activeChannel();
    return active ? active.created_by === this.currentUserId : false;
  }

  view: 'members' | 'add' = 'members';

  // Check if a member is currently online
  isUserOnline(member: ChannelMember): boolean {
    return this.authSvc.onlineUserIds().has(member.id);
  }

  // Sets the initial sub-view (either members list or add member form) on component initialization
  ngOnInit() {
    this.view = this.initialView;
  }

  // Emits close event to close the dialog
  onClose() {
    this.close.emit();
  }

  // Switches the current sub-view to the add member form
  onAddMember() {
    this.view = 'add';
  }

  // Emits the member selection result and closes the dialog
  onAddMemberClosed(result?: any) {
    if (result) {
      this.addMember.emit(result);
    }
    this.close.emit();
  }

  async openMemberProfile(memberId: string): Promise<void> {
    await this.profileDialogSvc.openById(memberId, { suppressOutsideCloseOnce: true });
  }

  async removeMember(memberId: string) {
    const active = this.channelSvc.activeChannel();
    if (active && active.id) {
      try {
        await this.channelSvc.removeMemberFromChannel(active.id, memberId);
        this.memberRemoved.emit(memberId);
      } catch (err) {
        console.error('Failed to remove member:', err);
      }
    }
  }
}
