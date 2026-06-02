import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';

interface ChannelMember {
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

  view: 'members' | 'add' = 'members';

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
}
