import { Component, Input, Output, EventEmitter } from '@angular/core';

interface Channel {
  id: string;
  name: string;
}

interface User {
  name: string;
  isSelf: boolean;
  status: 'online' | 'offline';
  avatar: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent {
  @Output() toggleSidebar = new EventEmitter<boolean>();
  @Input() isClosed = false;
  isChannelsExpanded = true;
  isDMsExpanded = true;
  activeChannelId = '1';

  channels: Channel[] = [
    { id: '1', name: 'Entwicklerteam' }
  ];

  users: User[] = [
    { name: 'Frederik Beck', isSelf: true, status: 'online', avatar: 'img/avatars/avatar_male_1.svg' },
    { name: 'Sofia Müller', isSelf: false, status: 'online', avatar: 'img/avatars/avatar_female_1.svg' },
    { name: 'Noah Braun', isSelf: false, status: 'online', avatar: 'img/avatars/avatar_male_2.svg' },
    { name: 'Elise Roth', isSelf: false, status: 'offline', avatar: 'img/avatars/avatar_female_2.svg' },
    { name: 'Elias Neumann', isSelf: false, status: 'online', avatar: 'img/avatars/avatar_male_3.svg' },
    { name: 'Steffen Hoffmann', isSelf: false, status: 'online', avatar: 'img/avatars/avatar_male_4.svg' }
  ];

  selectChannel(id: string) {
    this.activeChannelId = id;
  }

  toggleChannels() {
    this.isChannelsExpanded = !this.isChannelsExpanded;
  }

  toggleDMs() {
    this.isDMsExpanded = !this.isDMsExpanded;
  }

  toggleOpenClosed() {
    this.isClosed = !this.isClosed;
    this.toggleSidebar.emit(this.isClosed);
  }
}
