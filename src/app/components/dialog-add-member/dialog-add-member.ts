import { Component, inject, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { channelService } from '../../services/channel.service';
import { User } from '../../interfaces/user.interface';

@Component({
  selector: 'app-dialog-add-member',
  standalone: true,
  imports: [
    MatDialogModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './dialog-add-member.html',
  styleUrl: './dialog-add-member.scss'
})
/**
 * Component for adding members to a channel.
 * Supports choosing between adding all users or specific users, with a user search dropdown.
 */
export class dialogAddMemberComponent implements OnInit {
  /**
   * Reference to the material dialog.
   * @private
   */
  private dialogRef = inject(MatDialogRef<dialogAddMemberComponent>, { optional: true });
  /**
   * Data injected into the dialog (e.g., channel name and mode).
   * @private
   */
  private injectedData = inject<{ channelName: string, mode?: 'create' | 'add' }>(MAT_DIALOG_DATA, { optional: true });
  /**
   * User service for accessing user data.
   * @private
   */
  private userSvc = inject(userService);
  /**
   * Authentication service to verify logged-in user status.
   * @private
   */
  private authSvc = inject(authService);
  /**
   * Channel service for accessing channel information.
   * @private
   */
  private channelSvc = inject(channelService);

  /**
   * Input data containing details about the channel and mode, used when embedded directly rather than via MatDialog.
   */
  @Input() inputData?: { channelName: string, mode?: 'create' | 'add' };
  /**
   * Indicates if the component is embedded directly in another component instead of opening as a modal dialog.
   */
  @Input() isEmbedded = false;
  /**
   * Event emitted when the dialog is closed.
   */
  @Output() dialogClosed = new EventEmitter<any>();

  /**
   * Checks if a user is currently online.
   * @param user The user object to check.
   * @returns True if the user is online, false otherwise.
   */
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  /**
   * Getter for the configuration data, combining injected data and inputs.
   * @returns The active channel name and mode configuration.
   */
  public get data() {
    return this.injectedData || this.inputData || { channelName: '' };
  }

  /**
   * The type of selection chosen: 'all' (all users) or 'specific' (individually chosen users).
   */
  selectionType: 'all' | 'specific' = 'all';
  /**
   * The search query used to filter users in the dropdown list.
   */
  searchQuery = '';
  /**
   * List of all available users to choose from.
   */
  users: User[] = [];
  /**
   * Filtered list of users based on the current search query.
   */
  filteredUsers: User[] = [];
  /**
   * List of users currently selected by the user.
   */
  selectedUsersList: User[] = [];
  /**
   * Indicates if the user search input field has focus.
   */
  isFocused = false;

  /**
   * Angular lifecycle hook called after component initialization.
   * Retrieves all users, filters duplicates, and filters out existing members if in 'add' mode.
   * @returns A promise that resolves when initialization completes.
   */
  async ngOnInit() {
    const allUsers = await this.userSvc.getAllUsers();
    const currentUserId = this.authSvc.currentUser()?.id || null;
    let usersList = this.userSvc.filterDuplicateGuests(allUsers, currentUserId);

    if (this.data.mode === 'add') {
      this.selectionType = 'specific';
      usersList = await this.filterExistingMembers(usersList);
    }

    this.users = usersList;
    this.filterUsers();

    if (this.dialogRef) {
      this.dialogRef.backdropClick().subscribe(() => {
        this.closeWithAnimation();
      });
    }
  }

  /**
   * Filters out users who are already members of the active channel.
   * @param usersList The list of users to filter.
   * @returns A promise resolving to the list of users who are not yet members of the channel.
   * @private
   */
  private async filterExistingMembers(usersList: User[]): Promise<User[]> {
    const activeChannel = this.channelSvc.activeChannel();
    if (!activeChannel?.id) return usersList;
    try {
      const existingMembers = await this.channelSvc.getChannelMembers(activeChannel.id);
      const existingMemberIds = new Set(existingMembers.map(m => m.id));
      return usersList.filter(user => !existingMemberIds.has(user.id));
    } catch (error) {
      console.error('Error fetching existing channel members for filtering:', error);
      return usersList;
    }
  }

  /**
   * Filters the available users list based on the search query, excluding already selected users.
   */
  filterUsers(): void {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.filteredUsers = [];
    } else {
      this.filteredUsers = this.users.filter(user => {
        const matchesQuery = 
          user.display_name.toLowerCase().includes(query) ||
          (user.email && user.email.toLowerCase().includes(query));
        const isAlreadySelected = this.selectedUsersList.some(u => u.id === user.id);
        return matchesQuery && !isAlreadySelected;
      });
    }
  }

  /**
   * Adds a user to the selected list from the dropdown dropdown.
   * Clears the search query and refilters the users.
   * @param user The user that was selected.
   */
  selectUserFromDropdown(user: User): void {
    if (!this.selectedUsersList.some(u => u.id === user.id)) {
      this.selectedUsersList.push(user);
    }
    this.searchQuery = '';
    this.filterUsers();
  }

  /**
   * Removes a user from the selected list by their ID.
   * @param userId The ID of the user to remove.
   */
  removeUserChip(userId: string): void {
    this.selectedUsersList = this.selectedUsersList.filter(u => u.id !== userId);
    this.filterUsers();
  }

  /**
   * Determines if the submit action is disabled.
   * Disabled if the selection type is set to 'specific' but no users are selected.
   * @returns True if submit should be disabled, false otherwise.
   */
  isSubmitDisabled(): boolean {
    return this.selectionType === 'specific' && this.selectedUsersList.length === 0;
  }

  /**
   * The initial vertical touch coordinate recorded at the start of a touch interaction.
   * @private
   */
  private touchStartY = 0;

  /**
   * Handles the start of a touch interaction on the drag handle, storing the initial vertical position.
   * Only active when the component is not embedded (i.e. opened via MatDialog).
   * @param event The TouchEvent triggered by the user.
   */
  onTouchStart(event: TouchEvent): void {
    if (this.isEmbedded) return;
    this.touchStartY = event.touches[0].clientY;
  }

  /**
   * Handles the end of a touch interaction, triggering the closing animation if swiped downwards past the threshold.
   * Only active when the component is not embedded (i.e. opened via MatDialog).
   * @param event The TouchEvent triggered by the user.
   */
  onTouchEnd(event: TouchEvent): void {
    if (this.isEmbedded) return;
    const diffY = event.changedTouches[0].clientY - this.touchStartY;
    if (diffY > 50) {
      this.closeWithAnimation();
    }
  }

  /**
   * Initiates the closing sequence by setting the closing class on the dialog panel/backdrop and closing the ref after the animation.
   * @param result Optional result to return to the parent component.
   */
  closeWithAnimation(result?: any): void {
    const pane = document.querySelector('.add-member-dialog-container') as HTMLElement;
    if (pane) {
      pane.classList.add('dialog-closing');
    }
    const backdropEl = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
    if (backdropEl) {
      backdropEl.classList.add('dialog-closing-backdrop');
    }
    setTimeout(() => {
      if (this.dialogRef) {
        this.dialogRef.close(result);
      }
      this.dialogClosed.emit(result);
    }, 300);
  }

  /**
   * Closes the dialog or emits the dialog closed event if embedded.
   */
  closeDialog(): void {
    if (this.dialogRef) {
      this.closeWithAnimation();
    } else {
      this.dialogClosed.emit();
    }
  }

  /**
   * Saves the selection, closes the dialog, and emits the closed event with the result.
   */
  saveSelection(): void {
    if (this.isSubmitDisabled()) return;

    const result = {
      selectionType: this.selectionType,
      selectedUsers: this.selectedUsersList.map(u => u.id)
    };

    if (this.dialogRef) {
      this.closeWithAnimation(result);
    } else {
      this.dialogClosed.emit(result);
    }
  }
}
