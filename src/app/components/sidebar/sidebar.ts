import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { MatDialog, MatDialogModule, MatDialogConfig } from '@angular/material/dialog';
import { dialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { ToastService } from '../../services/toast.service';


export function getResponsiveDialogConfig(config: MatDialogConfig, type: 'full-screen' | 'bottom-sheet'): MatDialogConfig {
  const isMobile = window.innerWidth <= 767;
  if (!isMobile) return config;

  if (type === 'full-screen') {
    return {
      ...config,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      position: { top: '0px', left: '0px' }
    };
  } else {
    return {
      ...config,
      width: '100vw',
      height: 'auto',
      minHeight: 'auto',
      maxWidth: '100vw',
      maxHeight: 'auto',
      position: { bottom: '0px' }
    };
  }
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Output() toggleSidebar = new EventEmitter<boolean>();
  @Input() isClosed = false;

  isChannelsExpanded = true;
  isDMsExpanded = true;

  private channelSvc = inject(channelService);
  activeChannel = this.channelSvc.activeChannel;
  public userSvc = inject(userService);
  private authSvc = inject(AuthService);
  private dialog = inject(MatDialog);
  private messageSvc = inject(MessageService);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);

  channels = this.channelSvc.channels;
  users = signal<User[]>([]);
  usersWithHistory = signal<User[]>([]);
  usersWithoutHistory = signal<User[]>([]);
  unreadUsers = signal<Record<string, number>>({});
  private incomingDMsSubscription: RealtimeChannel | null = null;

  
  constructor() {
    effect(() => {
      const currentUser = this.authSvc.currentUser();
      if (currentUser && currentUser.id) {
        this.subscribeToDMs(currentUser.id);
        this.loadData();
      }
    });
  }

  
  subscribeToDMs(currentUserId: string) {
    if (this.incomingDMsSubscription) {
      this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    }

    this.incomingDMsSubscription = this.messageSvc.subscribeToAllUserDirectMessages(
      currentUserId,
      (msg) => {
        const activeDMUser = this.userSvc.activeDirectChatUser();

        
        if (msg.recipient_id === currentUserId) {
          if (activeDMUser?.id === msg.sender_id) {
            
            this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${msg.sender_id}`, new Date().toISOString());
          } else {
            
            this.unreadUsers.update((prev) => {
              const count = prev[msg.sender_id] || 0;
              const updated = {
                ...prev,
                [msg.sender_id]: count + 1,
              };
              return updated;
            });
          }
        }

        
        this.loadData();
      }
    );
  }

  
  async ngOnInit() {
    await this.loadData();
  }

  
  ngOnDestroy() {
    if (this.incomingDMsSubscription) {
      this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    }
  }

  
  async loadData() {
    const currentUserId = this.currentUserId;
    const fetchedChannels = await this.channelSvc.loadChannels();
    
    const active = this.activeChannel();
    if (active && !fetchedChannels.some(c => c.id === active.id)) {
      this.channelSvc.selectChannel(null);
    }
    
    if (fetchedChannels.length > 0 && !this.activeChannel() && !this.userSvc.activeDirectChatUser()) {
      this.channelSvc.selectChannel(fetchedChannels[0]);
    }

    const allFetchedUsers = await this.userSvc.getAllUsers();
    const fetchedUsers = this.userSvc.filterDuplicateGuests(allFetchedUsers, currentUserId);
    this.users.set(fetchedUsers);

    if (currentUserId) {
      
      const allDMs = await this.messageSvc.getAllUserDirectMessages(currentUserId);
      const activeDMUser = this.userSvc.activeDirectChatUser();

      const unreadMap: Record<string, number> = {};
      const latestMessageTimeMap = new Map<string, number>();

      allDMs.forEach((msg) => {
        const partnerId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
        if (partnerId) {
          
          const msgTime = new Date(msg.created_at || '').getTime();
          const currentLatest = latestMessageTimeMap.get(partnerId) || 0;
          if (msgTime > currentLatest) {
            latestMessageTimeMap.set(partnerId, msgTime);
          }

          
          if (msg.recipient_id === currentUserId) {
            if (activeDMUser?.id !== partnerId) {
              const lastReadStr = this.getSafeLocalStorageItem(`chat_last_read:${currentUserId}:${partnerId}`);
              const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : 0;

              if (msgTime > lastReadTime) {
                unreadMap[partnerId] = (unreadMap[partnerId] || 0) + 1;
              }
            }
          }
        }
      });
      this.unreadUsers.set(unreadMap);

      
      const partnerIdsSet = new Set<string>();
      latestMessageTimeMap.forEach((latestMsgTime, partnerId) => {
        
        if (partnerId === currentUserId) return;

        const closedStr = this.getSafeLocalStorageItem(`chat_closed:${currentUserId}:${partnerId}`);
        const closedTime = closedStr ? new Date(closedStr).getTime() : 0;

        if (latestMsgTime > closedTime) {
          partnerIdsSet.add(partnerId);
        }
      });



      const withHistory = fetchedUsers.filter((user) => partnerIdsSet.has(user.id));
      const withoutHistory = fetchedUsers.filter((user) => !partnerIdsSet.has(user.id));

      this.usersWithHistory.set(withHistory);
      this.usersWithoutHistory.set(withoutHistory);
    } else {
      this.unreadUsers.set({});
      this.usersWithHistory.set([]);
      this.usersWithoutHistory.set(fetchedUsers);
    }
  }

  
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  
  selectChannel(id: string | undefined) {
    if (!id) return;
    const channel = this.channels().find(c => c.id === id) || null;
    this.channelSvc.selectChannel(channel);
    this.userSvc.selectDirectChatUser(null); 

    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  
  selectUser(id: string | undefined) {
    if (!id) return;



    const user = this.users().find(u => u.id === id) || null;
    this.userSvc.selectDirectChatUser(user);
    this.channelSvc.selectChannel(null); 
    this.channelSvc.setNewMessageMode(false);

    const currentUserId = this.currentUserId;
    if (currentUserId) {
      
      this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${id}`, new Date().toISOString());
      
      
      this.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${id}`, '');
    }

    
    this.unreadUsers.update((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    this.loadData(); 

    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  
  async deleteChat(userId: string, event: Event) {
    event.stopPropagation(); 
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;

    try {
      
      await this.messageSvc.deleteDirectChatHistory(currentUserId, userId);

      
      this.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${userId}`, new Date().toISOString());

      
      this.unreadUsers.update((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      
      this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${userId}`, new Date().toISOString());

      
      if (this.userSvc.activeDirectChatUser()?.id === userId) {
        this.userSvc.selectDirectChatUser(null);
        
        
        const fetchedChannels = await this.channelSvc.loadChannels();
        if (fetchedChannels.length > 0) {
          this.channelSvc.selectChannel(fetchedChannels[0]);
        }
      }

      
      await this.loadData();
      this.toastSvc.show('Chat gelöscht', 'success', 3000, undefined, false);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  }

  
  private getSafeLocalStorageItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  }

  
  private setSafeLocalStorageItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
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

  startNewMessage() {
    this.channelSvc.setNewMessageMode(true);
    this.userSvc.selectDirectChatUser(null);
    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  
  async openCreateChannelDialog(): Promise<void> {
    const dialogRef = this.dialog.open(
      dialogCreateChannelComponent,
      getResponsiveDialogConfig(
        {
          width: '870px',
          height: '540px',
          panelClass: 'create-channel-dialog-container'
        },
        'full-screen'
      )
    );

    dialogRef.componentInstance.channelSaved.subscribe(async (result) => {
      const addMemberRef = this.dialog.open(
        dialogAddMemberComponent,
        getResponsiveDialogConfig(
          {
            width: '500px',
            minHeight: '290px',
            maxWidth: '100vw',
            maxHeight: '90vh',
            panelClass: ['custom-dialog-container', 'add-member-dialog-container'],
            data: { channelName: result.name }
          },
          'bottom-sheet'
        )
      );

      const memberResult = await firstValueFrom(addMemberRef.afterClosed());
      if (memberResult) {
        try {
          const currentUserId = this.authSvc.currentUser()?.id;
          
          
          const createdChannels = await this.channelSvc.createChannel({
            name: result.name,
            description: result.description,
            created_by: currentUserId ?? ''
          });
          
          
          const active = createdChannels?.[0];
          if (active && active.id) {
            let memberIds: string[] = [];
            if (memberResult.selectionType === 'all') {
              const allUsers = await this.userSvc.getAllUsers();
              const filteredUsers = this.userSvc.filterDuplicateGuests(allUsers, currentUserId ?? null);
              memberIds = filteredUsers.map(u => u.id);
            } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
              memberIds = memberResult.selectedUsers;
            }

            if (memberIds.length > 0) {
              
              if (currentUserId) {
                memberIds = memberIds.filter(id => id !== currentUserId);
              }
              if (memberIds.length > 0) {
                await this.channelSvc.addMembersToChannel(active.id, memberIds);
              }
            }
          }

          await this.loadData();
          dialogRef.close();
        } catch (error) {
          console.error('Failed to create channel:', error);
        }
      }
    });
  }

}