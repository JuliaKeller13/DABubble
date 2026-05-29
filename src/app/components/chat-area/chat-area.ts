import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageInputComponent } from '../message-input/message-input';
import { DialogChannelDetailsComponent } from '../dialog-channel-details/dialog-channel-details';
import { DialogChannelMembersComponent } from '../dialog-channel-members/dialog-channel-members';

interface ChannelMember {
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, MessageInputComponent, DialogChannelDetailsComponent, DialogChannelMembersComponent],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss'
})
export class ChatAreaComponent {
  @Input() isSidebarClosed = false;
  isChannelDetailsOpen = false;
  isChannelMembersOpen = false;

  members: ChannelMember[] = [
    { name: 'Frederik Beck', avatar: 'img/avatars/avatar_male_1.svg' },
    { name: 'Sofia Müller', avatar: 'img/avatars/avatar_female_1.svg' },
    { name: 'Noah Braun', avatar: 'img/avatars/avatar_male_2.svg' },
    { name: 'Elise Roth', avatar: 'img/avatars/avatar_female_2.svg' },
    { name: 'Elias Neumann', avatar: 'img/avatars/avatar_male_3.svg' },
  ];

  get visibleMembers(): ChannelMember[] {
    return this.members.slice(0, 3);
  }

  get memberCount(): number {
    return this.members.length;
  }

  openChannelDetails() {
    this.isChannelDetailsOpen = true;
  }

  closeChannelDetails() {
    this.isChannelDetailsOpen = false;
  }

  openChannelMembers() {
    this.isChannelMembersOpen = true;
  }

  closeChannelMembers() {
    this.isChannelMembersOpen = false;
  }

  onAddMember() {
  }
}
