import { Component, inject, OnInit, Optional, Input, Output, EventEmitter } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
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
export class dialogAddMemberComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<dialogAddMemberComponent>, { optional: true });
  private injectedData = inject<{ channelName: string, mode?: 'create' | 'add' }>(MAT_DIALOG_DATA, { optional: true });
  private userSvc = inject(userService);
  private authSvc = inject(AuthService);

  @Input() inputData?: { channelName: string, mode?: 'create' | 'add' };
  @Input() isEmbedded = false;
  @Output() dialogClosed = new EventEmitter<any>();

  // Check if a user is currently online using the real-time presence signal
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  // Resolves the input parameters from either MatDialog injection or component bindings
  public get data() {
    return this.injectedData || this.inputData || { channelName: '' };
  }

  selectionType: 'all' | 'specific' = 'all';
  searchQuery = '';
  users: User[] = [];
  filteredUsers: User[] = [];
  selectedUsersList: User[] = [];
  isFocused = false;

  // Loads all workspace users and checks initial display mode on component initialization
  async ngOnInit() {
    this.users = await this.userSvc.getAllUsers();
    if (this.data.mode === 'add') {
      this.selectionType = 'specific';
    }
    this.filterUsers();
  }

  // Filters users based on query and excludes already selected users
  filterUsers(): void {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.filteredUsers = [];
    } else {
      this.filteredUsers = this.users.filter(user => {
        const matchesQuery = 
          user.display_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query);
        const isAlreadySelected = this.selectedUsersList.some(u => u.id === user.id);
        return matchesQuery && !isAlreadySelected;
      });
    }
  }

  // Adds user from suggestion dropdown to chips list
  selectUserFromDropdown(user: User): void {
    if (!this.selectedUsersList.some(u => u.id === user.id)) {
      this.selectedUsersList.push(user);
    }
    this.searchQuery = '';
    this.filterUsers();
  }

  // Removes user chip
  removeUserChip(userId: string): void {
    this.selectedUsersList = this.selectedUsersList.filter(u => u.id !== userId);
    this.filterUsers();
  }

  // Checks if button should be disabled
  isSubmitDisabled(): boolean {
    return this.selectionType === 'specific' && this.selectedUsersList.length === 0;
  }

  // Closes dialog
  closeDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
    this.dialogClosed.emit();
  }

  // Submits selection and closes the dialog
  saveSelection(): void {
    if (this.isSubmitDisabled()) return;

    const result = {
      selectionType: this.selectionType,
      selectedUsers: this.selectedUsersList.map(u => u.id)
    };

    if (this.dialogRef) {
      this.dialogRef.close(result);
    }
    this.dialogClosed.emit(result);
  }
}
