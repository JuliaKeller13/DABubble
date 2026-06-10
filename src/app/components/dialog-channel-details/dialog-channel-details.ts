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
/**
 * Component representing the dialog to show channel details.
 * Allows members to view details, leave, edit name/description (if creator), or delete the channel.
 */
export class DialogChannelDetailsComponent implements OnInit {
  /**
   * Input indicating if the sidebar is closed.
   */
  @Input() isSidebarClosed = false;
  /**
   * List of members in the channel.
   */
  @Input() members: any[] = [];
  /**
   * Event emitted when the dialog is closed.
   */
  @Output() close = new EventEmitter<void>();
  /**
   * Event emitted when adding a member is requested.
   */
  @Output() addMember = new EventEmitter<void>();

  /**
   * Channel service injected to interact with channel data.
   * @private
   */
  private channelSvc = inject(channelService);
  /**
   * User service injected to retrieve user profiles.
   * @private
   */
  private userSvc = inject(userService);
  /**
   * Auth service injected to access currently logged-in user information.
   * @private
   */
  private authSvc = inject(authService);
  /**
   * Service to trigger opening of the user profile dialog.
   * @private
   */
  private profileDialogSvc = inject(ProfileDialogService);
  /**
   * Router to handle page redirection after deleting or leaving a channel.
   * @private
   */
  private router = inject(Router);

  /**
   * Checks whether a specific channel member is currently online.
   * @param member The member object to check.
   * @returns True if the user is online, false otherwise.
   */
  isUserOnline(member: any): boolean {
    return this.authSvc.onlineUserIds().has(member.id);
  }

  /**
   * Signal referencing the active channel.
   */
  activeChannel = this.channelSvc.activeChannel;
  /**
   * Signal storing the display name of the channel creator.
   */
  creatorName = signal<string>('Laden...');

  /**
   * Indicates if the channel name is currently being edited.
   */
  isEditingName = false;
  /**
   * Indicates if the channel description is currently being edited.
   */
  isEditingDescription = false;
  /**
   * Temporary value of the channel name during edit.
   */
  editNameValue = '';
  /**
   * Temporary value of the channel description during edit.
   */
  editDescriptionValue = '';

  /**
   * Angular lifecycle hook called after component initialization.
   * Fetches the creator's user details.
   * @returns A promise that resolves when the user lookup is complete.
   */
  async ngOnInit() {
    const creatorId = this.activeChannel()?.created_by;
    if (creatorId) {
      const creator = await this.userSvc.getUserById(creatorId);
      this.creatorName.set(creator ? creator.display_name : 'Unbekannt');
    }
  }

  /**
   * Getter for the current authenticated user's ID.
   * @returns The user ID string, or an empty string if not logged in.
   */
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  /**
   * Closes the channel details dialog.
   */
  onClose() {
    this.close.emit();
  }

  /**
   * Triggers the add member flow by emitting the addMember event.
   */
  onAddMember() {
    this.addMember.emit();
  }

  /**
   * Handles leaving the current channel for the logged-in user.
   * Reloads available channels and redirects.
   * @returns A promise resolving when the member is removed and navigation complete.
   */
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

  /**
   * Switches the component to name editing mode, prefilling the input field.
   */
  onEditName() {
    this.isEditingName = true;
    this.editNameValue = this.activeChannel()?.name || '';
  }

  /**
   * Saves the edited channel name to the database if the user is the creator.
   * @returns A promise resolving when name is updated.
   */
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

  /**
   * Switches the component to description editing mode, prefilling the input field.
   */
  onEditDescription() {
    this.isEditingDescription = true;
    this.editDescriptionValue = this.activeChannel()?.description || '';
  }

  /**
   * Saves the edited channel description to the database if the user is the creator.
   * @returns A promise resolving when description is updated.
   */
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

  /**
   * Deletes the active channel if the current user is the channel creator.
   * Redirects after deletion.
   * @returns A promise resolving when the channel is deleted and navigation complete.
   */
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

  /**
   * Navigates to the first remaining channel, or to the main workspace route if no channels are left.
   * @private
   */
  private navigateToRemainingOrMain(): void {
    const remaining = this.channelSvc.channels();
    if (remaining.length > 0) {
      this.router.navigate(['/main/channel', remaining[0].id]);
    } else {
      this.router.navigate(['/main']);
    }
  }

  /**
   * Opens the profile overlay dialog for the specified member.
   * @param memberId The ID of the member whose profile to display.
   * @returns A promise that resolves when the profile dialog starts opening.
   */
  async openMemberProfile(memberId: string): Promise<void> {
    await this.profileDialogSvc.openById(memberId, { suppressOutsideCloseOnce: true });
  }
}
