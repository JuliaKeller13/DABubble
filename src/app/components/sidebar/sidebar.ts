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

// Get dialog configuration based on responsive viewport width
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

  // Watch for authentication changes and reload sidebar data accordingly
  constructor() {
    effect(() => {
      const currentUser = this.authSvc.currentUser();
      if (currentUser && currentUser.id) {
        this.subscribeToDMs(currentUser.id);
        this.loadData();
      }
    });
  }

  // Subscribe to all DMs involving this user (incoming & outgoing)
  subscribeToDMs(currentUserId: string) {
    if (this.incomingDMsSubscription) {
      this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    }

    console.log('[Sidebar] Subscribing to DMs for user:', currentUserId);
    this.incomingDMsSubscription = this.messageSvc.subscribeToAllUserDirectMessages(
      currentUserId,
      (msg) => {
        console.log('[Sidebar] Received DM in real-time subscription:', msg);
        const activeDMUser = this.userSvc.activeDirectChatUser();

        // If incoming
        if (msg.recipient_id === currentUserId) {
          if (activeDMUser?.id === msg.sender_id) {
            // Opened chat: immediately mark as read in storage
            this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${msg.sender_id}`, new Date().toISOString());
          } else {
            // Not opened: increment unread badge count
            console.log('[Sidebar] Incrementing unread count for sender:', msg.sender_id);
            this.unreadUsers.update((prev) => {
              const count = prev[msg.sender_id] || 0;
              const updated = {
                ...prev,
                [msg.sender_id]: count + 1,
              };
              console.log('[Sidebar] Updated unread counts:', updated);
              return updated;
            });
          }
        }

        // Refresh data to update users lists (users with/without history) in real-time
        this.loadData();
      }
    );
  }

  // Initialize component and load initial data
  async ngOnInit() {
    await this.loadData();
  }

  // Clean up subscriptions on destroy
  ngOnDestroy() {
    if (this.incomingDMsSubscription) {
      this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    }
  }

  // Fetch channels and users, split based on DM history, and compute unread counts
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
      // 1. Fetch all DMs involving currentUserId to check history and compute unread counts
      const allDMs = await this.messageSvc.getAllUserDirectMessages(currentUserId);
      const activeDMUser = this.userSvc.activeDirectChatUser();

      const unreadMap: Record<string, number> = {};
      const latestMessageTimeMap = new Map<string, number>();

      allDMs.forEach((msg) => {
        const partnerId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
        if (partnerId) {
          // Keep track of the latest message timestamp for this partner
          const msgTime = new Date(msg.created_at || '').getTime();
          const currentLatest = latestMessageTimeMap.get(partnerId) || 0;
          if (msgTime > currentLatest) {
            latestMessageTimeMap.set(partnerId, msgTime);
          }

          // Compute unread counts (only for incoming messages)
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

      // Determine active partner IDs based on whether the latest message is newer than the closed timestamp
      const partnerIdsSet = new Set<string>();
      latestMessageTimeMap.forEach((latestMsgTime, partnerId) => {
        // Exclude the current user themselves from ever being moved above the divider
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

  // Get the current logged-in user ID
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  // Check if a user is currently online
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  // Set the active channel and close the sidebar on mobile/tablet viewports
  selectChannel(id: string | undefined) {
    if (!id) return;
    const channel = this.channels().find(c => c.id === id) || null;
    this.channelSvc.selectChannel(channel);
    this.userSvc.selectDirectChatUser(null); // Clear selected user

    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  // Set the active DM user and close the sidebar on mobile/tablet viewports
  selectUser(id: string | undefined) {
    if (!id) return;



    const user = this.users().find(u => u.id === id) || null;
    this.userSvc.selectDirectChatUser(user);
    this.channelSvc.selectChannel(null); // Clear active channel

    const currentUserId = this.currentUserId;
    if (currentUserId) {
      // Mark as read in localStorage
      this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${id}`, new Date().toISOString());
      
      // Clear closed timestamp so the chat becomes active again and moves above the divider
      this.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${id}`, '');
    }

    // Clear unread count for this user
    this.unreadUsers.update((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    this.loadData(); // Refresh partitions immediately in the UI

    if (window.innerWidth <= 1440) {
      this.isClosed = true;
      this.toggleSidebar.emit(true);
    }
  }

  // Delete chat history for a contact and move them back below the divider
  async deleteChat(userId: string, event: Event) {
    event.stopPropagation(); // Prevent selectUser from firing when clicking the x button
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;

    try {
      // Delete the message history from the database
      await this.messageSvc.deleteDirectChatHistory(currentUserId, userId);

      // 1. Mark the chat as closed by storing the current timestamp in localStorage
      this.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${userId}`, new Date().toISOString());

      // 2. Clear any unread counts for this chat
      this.unreadUsers.update((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      
      this.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${userId}`, new Date().toISOString());

      // 3. If this user was the active direct chat partner, clear selection
      if (this.userSvc.activeDirectChatUser()?.id === userId) {
        this.userSvc.selectDirectChatUser(null);
        
        // Auto-select the first channel to reset ChatArea context
        const fetchedChannels = await this.channelSvc.loadChannels();
        if (fetchedChannels.length > 0) {
          this.channelSvc.selectChannel(fetchedChannels[0]);
        }
      }

      // 4. Reload data in sidebar (this will update users lists)
      await this.loadData();
      this.toastSvc.show('Chat gelöscht', 'success', 3000, undefined, false);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  }

  // SSR-safe local storage retrieval
  private getSafeLocalStorageItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  }

  // SSR-safe local storage set
  private setSafeLocalStorageItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  }

  // Expand or collapse the channels list
  toggleChannels() {
    this.isChannelsExpanded = !this.isChannelsExpanded;
  }

  // Expand or collapse the direct messages list
  toggleDMs() {
    this.isDMsExpanded = !this.isDMsExpanded;
  }

  // Expand or collapse the sidebar
  toggleOpenClosed() {
    this.isClosed = !this.isClosed;
    this.toggleSidebar.emit(this.isClosed);
  }

  // Handle the sequential channel creation dialog flow
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
          
          // Create the channel in the database
          const createdChannels = await this.channelSvc.createChannel({
            name: result.name,
            description: result.description,
            created_by: currentUserId ?? ''
          });
          
          // If members were selected, add them to the channel
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
              // Filter out current user because the creator is already added in channelSvc.createChannel()
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