import {
  Component,
  Input,
  inject,
  signal,
  effect,
  ViewChild,
  ElementRef,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MessageInputComponent } from '../message-input/message-input';
import { MessageComponent } from '../message/message';
import { DialogChannelDetailsComponent } from '../dialog-channel-details/dialog-channel-details';
import { DialogChannelMembersComponent } from '../dialog-channel-members/dialog-channel-members';
import { channelService } from '../../services/channel.service';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { userService } from '../../services/user.service';
import { Message } from '../../interfaces/message.interface';
import { User } from '../../interfaces/user.interface';
import { Channel } from '../../interfaces/channel.interface';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ThreadService } from '../../services/thread.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { ToastService } from '../../services/toast.service';

interface ChannelMember {
  id: string;
  name: string;
  avatar: string;
}

interface DateGroup {
  dateLabel: string;
  messages: Message[];
}

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [
    CommonModule,
    MessageInputComponent,
    MessageComponent,
    DialogChannelDetailsComponent,
    DialogChannelMembersComponent,
    MatDialogModule,
    FormsModule,
  ],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss',
})
export class ChatAreaComponent implements OnDestroy {
  @Input() isSidebarClosed = false;
  isChannelDetailsOpen = false;
  isChannelMembersOpen = false;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  public channelSvc = inject(channelService);
  public userSvc = inject(userService);
  private dialog = inject(MatDialog);
  private messageSvc = inject(MessageService);
  private authSvc = inject(AuthService);
  private threadSvc = inject(ThreadService);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);

  activeChannel = this.channelSvc.activeChannel;
  activeDirectChatUser = this.userSvc.activeDirectChatUser;

  recipientQuery = '';
  showSearchDropdown = false;
  selectedRecipient: any | null = null;
  selectedRecipientType: 'channel' | 'user' | null = null;
  filteredChannels: Channel[] = [];
  filteredUsers: User[] = [];

  isHeaderMenuOpen = signal(false);
  isClearConfirmOpen = signal(false);
  isDragging = false;
  touchStartY = 0;
  currentTranslateY = 0;
  isAnimationActive = false;
  isClosing = false;

  
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  openActiveDirectChatProfile(): void {
    const activeUser = this.activeDirectChatUser();

    if (!activeUser) {
      return;
    }

    this.profileDialogSvc.open(activeUser, {
      suppressOutsideCloseOnce: activeUser.id === this.currentUserId,
    });
  }

  members = signal<ChannelMember[]>([]);
  messages = signal<Message[]>([]);
  private messagesSubscription: RealtimeChannel | null = null;
  private messageDeletedSubscription: Subscription | null = null;
  private optimisticReactionSubscription: Subscription | null = null;
  private directChatClearedSubscription: Subscription | null = null;
  typingUsers = signal<{ userId: string; userName: string }[]>([]);
  private typingTimeouts = new Map<string, any>();

  
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  
  get visibleMembers(): ChannelMember[] {
    return this.members().slice(0, 3);
  }

  
  get memberCount(): number {
    return this.members().length;
  }

  
  constructor() {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.messages.update((prev) => prev.filter((m) => m.id !== id));
      const activeThreadMsg = this.threadSvc.activeMessage();
      if (activeThreadMsg && activeThreadMsg.id === id) {
        this.threadSvc.closeThread();
      }
    });

    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(({ targetUserId }) => {
      const activeUser = this.activeDirectChatUser();
      if (activeUser && activeUser.id === targetUserId) {
        this.messages.set([]);
      }
    });

    this.optimisticReactionSubscription = this.messageSvc.optimisticReaction.subscribe(({ messageId, emoji, userId }) => {
      this.messages.update((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        let userIds = reactions[emoji] ? [...reactions[emoji]] : [];
        const index = userIds.indexOf(userId);
        if (index > -1) {
          userIds.splice(index, 1);
        } else {
          userIds.push(userId);
        }
        if (userIds.length === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = userIds;
        }
        return { ...m, reactions };
      }));
    });

    effect(() => {
      const channel = this.activeChannel();
      const targetUser = this.activeDirectChatUser();
      if (channel || targetUser) {
        this.clearSelectedRecipient();
      }
    });

    
    effect(() => {
      const dbMembers = this.channelSvc.activeChannelMembers();
      const filteredMembers = this.userSvc.filterDuplicateGuests(dbMembers, this.currentUserId);
      this.members.set(
        filteredMembers.map((user) => ({
          id: user.id,
          name: user.display_name,
          avatar: user.avatar_url || 'img/avatars/avatar_default.svg',
        })),
      );
    });

    
    effect(async () => {
      const channel = this.activeChannel();
      const targetUser = this.activeDirectChatUser();

      if (!channel || targetUser) {
        this.isChannelDetailsOpen = false;
        this.isChannelMembersOpen = false;
      }

      
      if (this.messagesSubscription) {
        this.messageSvc.unsubscribe(this.messagesSubscription);
        this.messagesSubscription = null;
      }

      
      this.typingUsers.set([]);

      if (channel && channel.id) {
        try {
          
          const dbMessages = await this.messageSvc.getChannelMessages(channel.id);
          this.messages.set(dbMessages);
          this.checkAndScrollToSearchTarget();

          
          this.messagesSubscription = this.messageSvc.subscribeToChannelMessages(
            channel.id,
            (event, msg) => {
              if (event === 'INSERT') {
                this.messages.update((prev) => {
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  return [...prev, msg];
                });
                this.scrollToBottom();
              } else if (event === 'UPDATE') {
                this.messages.update((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
              } else if (event === 'DELETE') {
                this.messages.update((prev) => prev.filter((m) => m.id !== msg.id));
              }
            },
            (typingPayload) => {
              this.handleTypingBroadcast(typingPayload);
            }
          );
        } catch (error) {
          console.error('Error loading channel messages:', error);
          this.messages.set([]);
        }
      } else if (targetUser && targetUser.id) {
        try {
          
          const dbMessages = await this.messageSvc.getDirectMessages(this.currentUserId, targetUser.id);
          this.messages.set(dbMessages);
          this.checkAndScrollToSearchTarget();

          
          this.messagesSubscription = this.messageSvc.subscribeToDirectMessages(
            this.currentUserId,
            targetUser.id,
            (event, msg) => {
              if (event === 'INSERT') {
                this.messages.update((prev) => {
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  return [...prev, msg];
                });
                this.scrollToBottom();
              } else if (event === 'UPDATE') {
                this.messages.update((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
              } else if (event === 'DELETE') {
                this.messages.update((prev) => prev.filter((m) => m.id !== msg.id));
              }
            },
            (typingPayload) => {
              this.handleTypingBroadcast(typingPayload);
            }
          );
        } catch (error) {
          console.error('Error loading direct messages:', error);
          this.messages.set([]);
        }
      } else {
        this.messages.set([]);
      }
    });
  }

  
  ngOnDestroy() {
    if (this.messagesSubscription) {
      this.messageSvc.unsubscribe(this.messagesSubscription);
    }
    if (this.messageDeletedSubscription) {
      this.messageDeletedSubscription.unsubscribe();
    }
    if (this.optimisticReactionSubscription) {
      this.optimisticReactionSubscription.unsubscribe();
    }
    if (this.directChatClearedSubscription) {
      this.directChatClearedSubscription.unsubscribe();
    }
  }

  
  
  get groupedMessages(): DateGroup[] {
    const groups: DateGroup[] = [];

    
    const rootMessages = this.messages()
      .filter((msg) => !msg.parent_id)
      .map((msg) => {
        const replies = this.messages().filter((m) => m.parent_id === msg.id);
        return {
          ...msg,
          reply_count: replies.length,
          last_reply_time: replies.length > 0 ? replies[replies.length - 1].created_at : undefined,
        } as Message;
      });

    rootMessages.forEach((msg) => {
      const label = this.getDateLabel(msg.created_at);
      let group = groups.find((g) => g.dateLabel === label);
      if (!group) {
        group = { dateLabel: label, messages: [] };
        groups.push(group);
      }
      group.messages.push(msg);
    });
    return groups;
  }

  
  private getDateLabel(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Heute';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Gestern';
    } else {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      };
      const formatted = date.toLocaleDateString('de-DE', options);
      return formatted.replace('.', ''); 
    }
  }

  
  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  
  public checkAndScrollToSearchTarget() {
    const targetId = this.messageSvc.searchTargetMessageId;
    if (targetId) {
      setTimeout(() => {
        const element = document.getElementById('message-' + targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          this.scrollToBottom();
        }
        
        setTimeout(() => {
          if (this.messageSvc.searchTargetMessageId === targetId) {
            this.messageSvc.searchTargetMessageId = null;
          }
        }, 3000);
      }, 300);
    } else {
      this.scrollToBottom();
    }
  }

  
  async searchRecipients() {
    const query = this.recipientQuery.trim();
    if (!query) {
      this.filteredChannels = [];
      this.filteredUsers = [];
      this.showSearchDropdown = false;
      return;
    }

    this.showSearchDropdown = true;
    
    const allC = this.channelSvc.channels();
    const allU = await this.userSvc.getAllUsers();
    const filteredAllUsers = this.userSvc.filterDuplicateGuests(allU, this.currentUserId);

    if (query.startsWith('#')) {
      const search = query.substring(1).toLowerCase();
      this.filteredChannels = allC.filter(c => c.name.toLowerCase().includes(search));
      this.filteredUsers = [];
    } else if (query.startsWith('@')) {
      const search = query.substring(1).toLowerCase();
      this.filteredUsers = filteredAllUsers.filter(u => u.display_name.toLowerCase().includes(search));
      this.filteredChannels = [];
    } else {
      const search = query.toLowerCase();
      this.filteredChannels = allC.filter(c => c.name.toLowerCase().includes(search));
      this.filteredUsers = filteredAllUsers.filter(u => 
        u.display_name.toLowerCase().includes(search) || 
        (u.email && u.email.toLowerCase().includes(search))
      );
    }
  }

  selectRecipient(recipient: any, type: 'channel' | 'user') {
    this.selectedRecipient = recipient;
    this.selectedRecipientType = type;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  clearSelectedRecipient() {
    this.selectedRecipient = null;
    this.selectedRecipientType = null;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    if (this.isHeaderMenuOpen() && !target.closest('.chat-area__menu-container')) {
      this.closeHeaderMenu();
    }

    if (!target.closest('.chat-area__new-msg-recipient-container')) {
      this.showSearchDropdown = false;
    }
  }

  async onSendMessage(content: any) {
    if (typeof content !== 'string') return;

    if (this.channelSvc.isNewMessageModeActive()) {
      if (!this.selectedRecipient) {
        console.warn('[onSendMessage] No recipient selected in new message mode');
        return;
      }

      const userId = this.currentUserId;
      if (!userId) {
        console.warn('[onSendMessage] Current user ID is null/empty');
        return;
      }

      if (this.selectedRecipientType === 'channel') {
        const targetChannel = this.selectedRecipient;
        const newMsg = await this.messageSvc.sendMessage(content, userId, targetChannel.id);
        if (newMsg) {
          this.channelSvc.selectChannel(targetChannel);
          this.channelSvc.setNewMessageMode(false);
          this.clearSelectedRecipient();
        } else {
          console.error('[onSendMessage] Failed to send message to channel');
        }
      } else if (this.selectedRecipientType === 'user') {
        const targetUser = this.selectedRecipient;
        const newMsg = await this.messageSvc.sendDirectMessage(content, userId, targetUser.id);
        if (newMsg) {
          this.userSvc.selectDirectChatUser(targetUser);
          this.channelSvc.setNewMessageMode(false);
          this.clearSelectedRecipient();
        } else {
          console.error('[onSendMessage] Failed to send direct message');
        }
      }
      return;
    }

    const channel = this.activeChannel();
    const dmUser = this.activeDirectChatUser();

    const userId = this.currentUserId;
    if (!userId) {
      console.warn('[onSendMessage] Current user ID is null/empty');
      return;
    }

    if (channel && channel.id) {
      const newMsg = await this.messageSvc.sendMessage(content, userId, channel.id);
      if (newMsg) {
        this.messages.update((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        this.scrollToBottom();
      } else {
        console.error('[onSendMessage] Failed to send message to database');
      }
    } else if (dmUser && dmUser.id) {
      if (dmUser.id === 'dabubble-team-local-id') {
        return;
      }
      const newMsg = await this.messageSvc.sendDirectMessage(content, userId, dmUser.id);
      if (newMsg) {
        this.messages.update((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        this.scrollToBottom();
      } else {
        console.error('[onSendMessage] Failed to send direct message to database');
      }
    }
  }

  
  onThreadClicked(message: Message) {
    this.threadSvc.openThread(message);
  }

  
  onMessageDeleted(messageId: string) {
    this.messages.update((prev) => prev.filter((m) => m.id !== messageId));
    const activeThreadMsg = this.threadSvc.activeMessage();
    if (activeThreadMsg && activeThreadMsg.id === messageId) {
      this.threadSvc.closeThread();
    }
  }

  
  handleTypingBroadcast(payload: { userId: string; userName: string; isTyping: boolean }) {
    if (payload.userId === this.currentUserId) return;

    
    const existingTimeout = this.typingTimeouts.get(payload.userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.typingTimeouts.delete(payload.userId);
    }

    if (payload.isTyping) {
      
      this.typingUsers.update((users) => {
        if (users.some((u) => u.userId === payload.userId)) return users;
        return [...users, { userId: payload.userId, userName: payload.userName }];
      });

      
      const timeout = setTimeout(() => {
        this.typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
        this.typingTimeouts.delete(payload.userId);
      }, 5000);
      this.typingTimeouts.set(payload.userId, timeout);
    } else {
      
      this.typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
    }
  }

  
  onTypingStatusChange(isTyping: boolean) {
    const profile = this.authSvc.currentUserProfile();
    if (profile && this.messagesSubscription) {
      this.messageSvc.sendTypingStatus(
        this.messagesSubscription,
        profile.id,
        profile.display_name,
        isTyping
      );
    }
  }

  
  getTypingText(): string {
    const users = this.typingUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].userName} schreibt...`;
    if (users.length === 2) return `${users[0].userName} und ${users[1].userName} schreiben...`;
    return 'Mehrere Personen schreiben...';
  }

  
  openChannelDetails() {
    this.isChannelDetailsOpen = true;
  }

  
  closeChannelDetails() {
    this.isChannelDetailsOpen = false;
  }

  channelMembersInitialView: 'members' | 'add' = 'members';
  channelMembersPosition: 'right-110' | 'right-50' = 'right-110';

  
  openChannelMembers() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'members';
    this.channelMembersPosition = 'right-110';
  }

  
  closeChannelMembers() {
    this.isChannelMembersOpen = false;
  }

  
  async onAddMember() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'add';
    this.channelMembersPosition = 'right-50';
  }

  
  async onMembersAdded(memberResult: any) {
    if (!memberResult) return;

    const active = this.activeChannel();
    if (!active || !active.id) return;

    try {
      let memberIds: string[] = [];
      if (memberResult.selectionType === 'all') {
        const allUsers = await this.userSvc.getAllUsers();
        const filteredAllUsers = this.userSvc.filterDuplicateGuests(allUsers, this.currentUserId);
        memberIds = filteredAllUsers.map((u) => u.id);
      } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
        memberIds = memberResult.selectedUsers;
      }

      if (memberIds.length > 0) {
        await this.channelSvc.addMembersToChannel(active.id, memberIds);

        
        await this.channelSvc.refreshActiveChannelMembers();
      }
    } catch (error) {
      console.error('Error adding members in chat area:', error);
    }
  }

  
  async onMemberRemoved(memberId: string) {
    const active = this.activeChannel();
    if (!active || !active.id) return;

    try {
      
      await this.channelSvc.refreshActiveChannelMembers();
    } catch (error) {
      console.error('Error reloading members list after removal:', error);
    }
  }

  toggleHeaderMenu() {
    this.isHeaderMenuOpen.update((prev) => !prev);
  }

  closeHeaderMenu() {
    this.isHeaderMenuOpen.set(false);
  }

  async hideActiveChat() {
    this.closeHeaderMenu();
    const targetUser = this.activeDirectChatUser();
    const currentUserId = this.currentUserId;
    if (targetUser && currentUserId) {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`chat_closed:${currentUserId}:${targetUser.id}`, new Date().toISOString());
      }
      this.userSvc.selectDirectChatUser(null);
      const fetchedChannels = await this.channelSvc.loadChannels();
      if (fetchedChannels.length > 0) {
        this.channelSvc.selectChannel(fetchedChannels[0]);
      }
    }
  }

  openClearConfirm() {
    this.closeHeaderMenu();
    this.isClearConfirmOpen.set(true);
    this.isAnimationActive = true;
    setTimeout(() => {
      this.isAnimationActive = false;
    }, 300);
  }

  cancelClearHistory() {
    this.isClearConfirmOpen.set(false);
    this.isAnimationActive = false;
    this.isClosing = false;
  }

  closeWithSlideDown() {
    if (typeof window !== 'undefined' && window.innerWidth <= 1200) {
      this.isClosing = true;
      setTimeout(() => {
        this.cancelClearHistory();
      }, 200);
    } else {
      this.cancelClearHistory();
    }
  }

  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    this.isDragging = true;
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    const currentY = event.touches[0].clientY;
    const deltaY = currentY - this.touchStartY;
    if (deltaY > 0) {
      this.currentTranslateY = deltaY;
    } else {
      this.currentTranslateY = 0;
    }
  }

  onTouchEnd(event: TouchEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.currentTranslateY > 80) {
      this.cancelClearHistory();
    }
    this.currentTranslateY = 0;
  }

  async confirmClearHistory() {
    const targetUser = this.activeDirectChatUser();
    const currentUserId = this.currentUserId;
    if (targetUser && currentUserId) {
      const success = await this.messageSvc.deleteDirectChatHistory(currentUserId, targetUser.id);
      if (success) {
        this.messages.set([]);
        this.toastSvc.show('Chatverlauf gelöscht', 'success', 3000, undefined, false);
        
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(`chat_closed:${currentUserId}:${targetUser.id}`, new Date().toISOString());
        }
        this.userSvc.selectDirectChatUser(null);
        const fetchedChannels = await this.channelSvc.loadChannels();
        if (fetchedChannels.length > 0) {
          this.channelSvc.selectChannel(fetchedChannels[0]);
        }
      } else {
        this.toastSvc.show('Fehler beim Löschen des Chatverlaufs', 'error', 3000, undefined, false);
      }
    }
    this.isClearConfirmOpen.set(false);
  }
}
