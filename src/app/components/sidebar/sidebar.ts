import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { User } from '../../interfaces/user.interface';
import { Message } from '../../interfaces/message.interface';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { messageService } from '../../services/message.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MatDialog, MatDialogModule, MatDialogConfig } from '@angular/material/dialog';
import { dialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { ToastService } from '../../services/toast.service';
import { SearchBarComponent } from '../searchbar/searchbar';


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
  imports: [CommonModule, MatDialogModule, SearchBarComponent],
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
  private authSvc = inject(authService);
  private dialog = inject(MatDialog);
  private messageSvc = inject(messageService);
  private toastSvc = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  channels = this.channelSvc.channels;
  users = signal<User[]>([]);
  usersWithHistory = signal<User[]>([]);
  usersWithoutHistory = signal<User[]>([]);
  unreadUsers = signal<Record<string, number>>({});
  unreadChannels = signal<Record<string, number>>({});
  isSidebarLoading = signal<boolean>(true);
  private incomingDMsSubscription: RealtimeChannel | null = null;
  private globalMessagesSubscription: RealtimeChannel | null = null;
  private directChatClearedSubscription: Subscription | null = null;
  private routerSubscription: Subscription | null = null;

  
  constructor() {
    effect(() => {
      const currentUser = this.authSvc.currentUser();
      if (currentUser && currentUser.id) {
        this.subscribeToDMs(currentUser.id);
        this.subscribeToGlobalMessages(currentUser.id);
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

  subscribeToGlobalMessages(currentUserId: string) {
    if (this.globalMessagesSubscription) {
      this.messageSvc.unsubscribe(this.globalMessagesSubscription);
      this.globalMessagesSubscription = null;
    }

    this.globalMessagesSubscription = this.messageSvc.subscribeToAllChannelMentions(
      currentUserId,
      () => {
        this.loadData();
      }
    );
  }

  
  async ngOnInit() {
    await this.loadData();
    this.handleRouteSelection();
    this.channelSvc.isInitializing.set(false);

    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.handleRouteSelection();
    });

    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(() => {
      this.loadData();
    });
  }

  
  ngOnDestroy() {
    if (this.incomingDMsSubscription) {
      this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    }
    if (this.globalMessagesSubscription) {
      this.messageSvc.unsubscribe(this.globalMessagesSubscription);
    }
    if (this.directChatClearedSubscription) {
      this.directChatClearedSubscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  
  private isUserMentionedInText(content: string, currentUserId: string): boolean {
    if (!content) return false;
    return content.includes(`<@${currentUserId}>`);
  }

  async loadData() {
    const isInitial = this.channels().length === 0 &&
                      this.usersWithHistory().length === 0 &&
                      this.usersWithoutHistory().length === 0;
    if (isInitial) {
      this.isSidebarLoading.set(true);
    }
    try {
      const currentUserId = this.currentUserId;
      const fetchedChannels = await this.channelSvc.loadChannels();
      const allFetchedUsers = await this.userSvc.getAllUsers();
      
      const active = this.activeChannel();
      if (active && !fetchedChannels.some(c => c.id === active.id)) {
        this.channelSvc.selectChannel(null);
      }
      
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
      const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
      if (isResponsive && !isMobile) {
        if (fetchedChannels.length > 0 && !this.activeChannel() && !this.userSvc.activeDirectChatUser() && !this.channelSvc.isNewMessageModeActive()) {
          this.router.navigate(['/main/channel', fetchedChannels[0].id]);
        }
      }

      const activeChan = this.activeChannel();
      if (currentUserId && activeChan?.id) {
        this.setSafeLocalStorageItem(`channel_last_read:${currentUserId}:${activeChan.id}`, new Date().toISOString());
      }

      const unreadChanMap: Record<string, number> = {};
      if (currentUserId) {
        const mentions = await this.messageSvc.getChannelMentions(currentUserId);
        const activeChannelId = this.activeChannel()?.id;

        mentions.forEach((msg) => {
          const chanId = msg.channel_id;
          if (!chanId) return;

          if (activeChannelId === chanId) return;

          if (!this.isUserMentionedInText(msg.content || '', currentUserId)) {
            return;
          }

          const lastReadStr = this.getSafeLocalStorageItem(`channel_last_read:${currentUserId}:${chanId}`);
          const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : 0;
          const msgTime = new Date(msg.created_at || '').getTime();

          if (msgTime > lastReadTime) {
            unreadChanMap[chanId] = (unreadChanMap[chanId] || 0) + 1;
          }
        });
      }
      this.unreadChannels.set(unreadChanMap);
      
      const partnerIdsSet = new Set<string>();
      const unreadMap: Record<string, number> = {};
      const latestMessageTimeMap = new Map<string, number>();
      let allDMs: Message[] = [];
      let isGuest = false;

      if (currentUserId) {
        isGuest = !!(this.authSvc.currentUser()?.is_anonymous || this.authSvc.currentUserProfile()?.display_name === 'Gast');
        const dbDeletions = await this.messageSvc.getDirectChatDeletions(currentUserId);
        allDMs = await this.messageSvc.getAllUserDirectMessages(currentUserId);
        const activeDMUser = this.userSvc.activeDirectChatUser();

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

        if (isGuest) {
          if (activeDMUser?.id !== 'dabubble-team-local-id') {
            const lastReadStr = this.getSafeLocalStorageItem(`chat_last_read:${currentUserId}:dabubble-team-local-id`);
            if (!lastReadStr) {
              unreadMap['dabubble-team-local-id'] = 1;
            }
          }
        }

        this.unreadUsers.set(unreadMap);

        latestMessageTimeMap.forEach((latestMsgTime, partnerId) => {
          if (partnerId === currentUserId) return;

          const closedStr = this.getSafeLocalStorageItem(`chat_closed:${currentUserId}:${partnerId}`);
          const localClosedTime = closedStr ? new Date(closedStr).getTime() : 0;
          const dbClosedStr = dbDeletions[partnerId];
          const dbClosedTime = dbClosedStr ? new Date(dbClosedStr).getTime() : 0;
          const closedTime = Math.max(localClosedTime, dbClosedTime);

          if (latestMsgTime > closedTime) {
            partnerIdsSet.add(partnerId);
          }
        });
      }

      const fetchedUsers = this.userSvc.filterDuplicateGuests(allFetchedUsers, currentUserId, Array.from(partnerIdsSet));
      this.users.set(fetchedUsers);

      if (currentUserId) {
        const withHistory = fetchedUsers.filter((user) => partnerIdsSet.has(user.id));
        if (isGuest) {
          const closedStr = this.getSafeLocalStorageItem(`chat_closed:${currentUserId}:dabubble-team-local-id`);
          if (!closedStr) {
            if (!withHistory.some(u => u.id === 'dabubble-team-local-id')) {
              withHistory.unshift({
                id: 'dabubble-team-local-id',
                display_name: 'DABubble-Team',
                email: 'team@dabubble.local',
                avatar_url: 'img/logo/Logo.svg',
                status: 'online'
              });
            }
          }
        }
        const withoutHistory = fetchedUsers.filter((user) => !partnerIdsSet.has(user.id));

        this.usersWithHistory.set(withHistory);
        this.usersWithoutHistory.set(withoutHistory);
      } else {
        this.unreadUsers.set({});
        this.unreadChannels.set({});
        this.usersWithHistory.set([]);
        this.usersWithoutHistory.set(fetchedUsers);
      }
    } catch (error) {
      console.error('Error loading sidebar data:', error);
    } finally {
      this.isSidebarLoading.set(false);
    }
  }

  
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  
  isUserOnline(user: User): boolean {
    if (user.id === 'dabubble-team-local-id') return true;
    return this.authSvc.onlineUserIds().has(user.id);
  }

  
  selectChannel(id: string | undefined) {
    if (!id) return;
    const active = this.activeChannel();
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    if (active && active.id === id) {
      if (!isResponsive) {
        this.router.navigate(['/main']);
      }
    } else {
      this.router.navigate(['/main/channel', id]);
    }

    const currentUserId = this.currentUserId;
    if (currentUserId) {
      this.setSafeLocalStorageItem(`channel_last_read:${currentUserId}:${id}`, new Date().toISOString());
      this.unreadChannels.update((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }

    if (isResponsive) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  
  selectUser(id: string | undefined) {
    if (!id) return;

    const activeUser = this.userSvc.activeDirectChatUser();
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    if (activeUser && activeUser.id === id) {
      if (!isResponsive) {
        this.router.navigate(['/main']);
      }
    } else {
      this.router.navigate(['/main/dm', id]);
    }

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

    if (isResponsive) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  
  async closeChat(userId: string, event: Event) {
    event.stopPropagation(); 
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;

    try {
      this.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${userId}`, new Date().toISOString());

      this.unreadUsers.update((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      
      this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${userId}`, new Date().toISOString());

      if (this.userSvc.activeDirectChatUser()?.id === userId) {
        const fetchedChannels = await this.channelSvc.loadChannels();
        if (fetchedChannels.length > 0) {
          this.router.navigate(['/main/channel', fetchedChannels[0].id]);
        } else {
          this.router.navigate(['/main']);
        }
      }

      await this.loadData();
    } catch (err) {
      console.error('Failed to close chat:', err);
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
    this.router.navigate(['/main/new-message']);
    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  private handleRouteSelection() {
    const url = this.router.url;
    const fetchedChannels = this.channelSvc.channels();
    const allUsers = this.users();

    if (url.includes('/main/channel/')) {
      const parts = url.split('/main/channel/');
      const channelId = parts[1]?.split('?')[0];
      if (channelId) {
        const channel = fetchedChannels.find(c => c.id === channelId);
        if (channel) {
          this.channelSvc.selectChannel(channel);
          this.userSvc.selectDirectChatUser(null);
        }
      }
    } else if (url.includes('/main/dm/')) {
      const parts = url.split('/main/dm/');
      const userId = parts[1]?.split('?')[0];
      if (userId) {
        if (userId === 'dabubble-team-local-id') {
          const teamUser = {
            id: 'dabubble-team-local-id',
            display_name: 'DABubble-Team',
            email: 'team@dabubble.local',
            avatar_url: 'img/logo/Logo.svg',
            status: 'online' as const
          };
          this.userSvc.selectDirectChatUser(teamUser);
          this.channelSvc.selectChannel(null);
        } else {
          const user = allUsers.find(u => u.id === userId);
          if (user) {
            this.userSvc.selectDirectChatUser(user);
            this.channelSvc.selectChannel(null);
          }
        }
      }
    } else if (url.includes('/main/new-message')) {
      this.channelSvc.setNewMessageMode(true);
      this.userSvc.selectDirectChatUser(null);
    } else {
      this.channelSvc.selectChannel(null);
      this.userSvc.selectDirectChatUser(null);
      this.channelSvc.setNewMessageMode(false);
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
        dialogRef.close();
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
          if (active && active.id) {
            this.router.navigate(['/main/channel', active.id]);
          }
          this.toastSvc.show('Channel erfolgreich erstellt.', 'success', 3000, undefined, false);
        } catch (error) {
          console.error('Failed to create channel:', error);
          this.toastSvc.show('Channel konnte nicht erstellt werden.', 'error', 3000, undefined, false);
        }
      }
    });
  }

  onSearchItemSelected() {
    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

}