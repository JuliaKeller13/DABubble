import { Component, Output, EventEmitter, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { authService } from '../../services/auth.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { channelService } from '../../services/channel.service';

/**
 * Interface representing a channel member.
 */
interface ChannelMember {
  /** The unique identifier of the channel member. */
  id: string;
  /** The display name of the channel member. */
  name: string;
  /** The URL or path to the member's avatar image. */
  avatar: string;
}

/**
 * Component representing the channel members dialog.
 * Displays list of channel members, online statuses, and allows adding new members or removing existing members (if creator).
 */
@Component({
  selector: 'app-dialog-channel-members',
  standalone: true,
  imports: [CommonModule, dialogAddMemberComponent],
  templateUrl: './dialog-channel-members.html',
  styleUrl: './dialog-channel-members.scss'
})
export class DialogChannelMembersComponent implements OnInit {
  /**
   * Input indicating if the sidebar is closed.
   */
  @Input() isSidebarClosed = false;
  /**
   * The list of members in the channel.
   */
  @Input() members: ChannelMember[] = [];
  /**
   * The name of the channel.
   */
  @Input() channelName: string = '';
  /**
   * The initial view mode of the dialog: either showing 'members' or 'add' member screen.
   */
  @Input() initialView: 'members' | 'add' = 'members';
  /**
   * Class name defining the position offset.
   */
  @Input() positionClass: 'right-110' | 'right-50' = 'right-110';
  /**
   * Event emitted when the dialog is closed.
   */
  @Output() close = new EventEmitter<void>();
  /**
   * Event emitted when a new member is added.
   */
  @Output() addMember = new EventEmitter<any>();
  /**
   * Event emitted when a member is removed from the channel.
   */
  @Output() memberRemoved = new EventEmitter<string>();

  /**
   * Authentication service.
   * @private
   */
  private authSvc = inject(authService);
  /**
   * Profile dialog service to view details about members.
   * @private
   */
  private profileDialogSvc = inject(ProfileDialogService);
  /**
   * Channel service.
   * @private
   */
  private channelSvc = inject(channelService);

  /**
   * Getter for the current authenticated user's ID.
   * @returns The user ID string, or an empty string if not logged in.
   */
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  /**
   * Getter to check if the current user is the creator of the active channel.
   * @returns True if current user created the channel, false otherwise.
   */
  get isCreator(): boolean {
    const active = this.channelSvc.activeChannel();
    return active ? active.created_by === this.currentUserId : false;
  }

  /**
   * Current active view state of the dialog ('members' list or 'add' member interface).
   */
  view: 'members' | 'add' = 'members';

  /**
   * Checks if a channel member is currently online.
   * @param member The channel member to check.
   * @returns True if the user is online, false otherwise.
   */
  isUserOnline(member: ChannelMember): boolean {
    return this.authSvc.onlineUserIds().has(member.id);
  }

  /**
   * Angular lifecycle hook. Sets the view to the initialView input parameter.
   */
  ngOnInit() {
    this.view = this.initialView;
  }

  /**
   * Flag indicating whether the closing animation is currently in progress.
   */
  isClosing = false;
  /**
   * The initial vertical touch coordinate recorded at the start of a touch interaction.
   * @private
   */
  private touchStartY = 0;

  /**
   * Handles the start of a touch interaction on the drag handle, storing the initial vertical position.
   * @param event The TouchEvent triggered by the user.
   */
  onTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0].clientY;
  }

  /**
   * Handles the end of a touch interaction, triggering the closing animation if swiped downwards past the threshold.
   * @param event The TouchEvent triggered by the user.
   */
  onTouchEnd(event: TouchEvent): void {
    const diffY = event.changedTouches[0].clientY - this.touchStartY;
    if (diffY > 50) {
      this.closeWithAnimation();
    }
  }

  /**
   * Initiates the closing sequence by setting the closing state and emitting the close event after the animation completes.
   */
  closeWithAnimation(): void {
    this.isClosing = true;
    setTimeout(() => {
      this.close.emit();
      this.isClosing = false;
    }, 300);
  }

  /**
   * Triggers the closing event of the dialog.
   */
  onClose() {
    this.closeWithAnimation();
  }

  /**
   * Switches the active view to 'add' member mode.
   */
  onAddMember() {
    this.view = 'add';
  }

  /**
   * Handles close action from the nested dialog-add-member component.
   * Emits the addMember event with selection details if valid and closes the dialog.
   * @param result The result object returned from the member selection dialog.
   */
  onAddMemberClosed(result?: any) {
    if (result) {
      this.addMember.emit(result);
    }
    this.closeWithAnimation();
  }

  /**
   * Opens the profile dialog overlay for a channel member.
   * @param memberId The ID of the member whose profile to display.
   * @returns A promise resolving when the profile dialog is initiated.
   */
  async openMemberProfile(memberId: string): Promise<void> {
    await this.profileDialogSvc.openById(memberId, { suppressOutsideCloseOnce: true });
  }

  /**
   * Removes a member from the active channel database record and emits memberRemoved event.
   * @param memberId The ID of the member to be removed.
   * @returns A promise resolving when removal is completed.
   */
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
