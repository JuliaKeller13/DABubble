import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ChannelMember {
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-dialog-channel-members',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog-channel-members.html',
  styleUrl: './dialog-channel-members.scss'
})
export class DialogChannelMembersComponent {
  @Input() isSidebarClosed = false;
  @Input() members: ChannelMember[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() addMember = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }

  onAddMember() {
    this.addMember.emit();
    this.close.emit();
  }
}
