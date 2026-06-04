import {
  Component,
  Input,
  inject,
  signal,
  effect,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
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
import { RealtimeChannel } from '@supabase/supabase-js';
import { ThreadService } from '../../services/thread.service';

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
  ],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss',
})
export class ChatAreaComponent implements OnDestroy {
  @Input() isSidebarClosed = false;
  isChannelDetailsOpen = false;
  isChannelMembersOpen = false;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private dialog = inject(MatDialog);
  private messageSvc = inject(MessageService);
  private authSvc = inject(AuthService);
  private threadSvc = inject(ThreadService);

  // Expose active channel and active direct chat user from the shared services
  activeChannel = this.channelSvc.activeChannel;
  activeDirectChatUser = this.userSvc.activeDirectChatUser;

  // Check if a user is currently online
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  members = signal<ChannelMember[]>([]);
  messages = signal<Message[]>([]);
  private messagesSubscription: RealtimeChannel | null = null;
  private messageDeletedSubscription: Subscription | null = null;
  typingUsers = signal<{ userId: string; userName: string }[]>([]);
  private typingTimeouts = new Map<string, any>();

  // Retrieve current user ID
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  // Returns the first three members of the active channel to display as avatars
  get visibleMembers(): ChannelMember[] {
    return this.members().slice(0, 3);
  }

  // Returns the total number of members in the active channel
  get memberCount(): number {
    return this.members().length;
  }

  // Listens to active channel changes, loads members and handles messages subscription
  constructor() {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.messages.update((prev) => prev.filter((m) => m.id !== id));
      const activeThreadMsg = this.threadSvc.activeMessage();
      if (activeThreadMsg && activeThreadMsg.id === id) {
        this.threadSvc.closeThread();
      }
    });

    // Effect 1: Channel Members
    effect(async () => {
      const channel = this.activeChannel();
      if (channel && channel.id) {
        try {
          const dbMembers = await this.channelSvc.getChannelMembers(channel.id);
          this.members.set(
            dbMembers.map((user) => ({
              id: user.id,
              name: user.display_name,
              avatar: user.avatar_url || 'img/avatars/avatar_default.svg',
            })),
          );
        } catch (error) {
          console.error('Error loading channel members:', error);
          this.members.set([]);
        }
      } else {
        this.members.set([]);
      }
    });

    // Effect 2: Messages and Realtime Updates (both Channel and DM)
    effect(async () => {
      const channel = this.activeChannel();
      const targetUser = this.activeDirectChatUser();

      // Cleanup previous subscription
      if (this.messagesSubscription) {
        this.messageSvc.unsubscribe(this.messagesSubscription);
        this.messagesSubscription = null;
      }

      // Reset typing users list when transitioning to a different chat room
      this.typingUsers.set([]);

      if (channel && channel.id) {
        try {
          // Fetch historical channel messages
          const dbMessages = await this.messageSvc.getChannelMessages(channel.id);
          this.messages.set(dbMessages);
          this.scrollToBottom();

          // Create realtime subscription for live insertions, updates and typing broadcasts
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
          // Fetch historical direct messages
          const dbMessages = await this.messageSvc.getDirectMessages(this.currentUserId, targetUser.id);
          this.messages.set(dbMessages);
          this.scrollToBottom();

          // Create realtime subscription for DMs
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

  // Clean up subscriptions on destroy
  ngOnDestroy() {
    if (this.messagesSubscription) {
      this.messageSvc.unsubscribe(this.messagesSubscription);
    }
    if (this.messageDeletedSubscription) {
      this.messageDeletedSubscription.unsubscribe();
    }
  }

  // Group messages dynamically by their formatted creation date label
  // Group only root messages dynamically by their formatted creation date label
  get groupedMessages(): DateGroup[] {
    const groups: DateGroup[] = [];

    // Filter root messages and map their reply counts and last reply times
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

  // Generate date labels (Today, Yesterday, or localized weekdays)
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
      return formatted.replace('.', ''); // Removes the dot after the day number (e.g. "14. January" -> "14 January")
    }
  }

  // Push scroll viewport position to the bottom of the message feed
  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  // Send a new message to the active channel or direct chat user
  async onSendMessage(content: any) {
    if (typeof content !== 'string') return;
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

  // Triggers opening the thread view for a message
  onThreadClicked(message: Message) {
    this.threadSvc.openThread(message);
  }

  // Handles message deletion by updating the local messages list and closing thread if active
  onMessageDeleted(messageId: string) {
    this.messages.update((prev) => prev.filter((m) => m.id !== messageId));
    const activeThreadMsg = this.threadSvc.activeMessage();
    if (activeThreadMsg && activeThreadMsg.id === messageId) {
      this.threadSvc.closeThread();
    }
  }

  // Handles real-time typing events from other users
  handleTypingBroadcast(payload: { userId: string; userName: string; isTyping: boolean }) {
    if (payload.userId === this.currentUserId) return;

    // Clear existing timeout for this user
    const existingTimeout = this.typingTimeouts.get(payload.userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.typingTimeouts.delete(payload.userId);
    }

    if (payload.isTyping) {
      // Add user if not already in the typing list
      this.typingUsers.update((users) => {
        if (users.some((u) => u.userId === payload.userId)) return users;
        return [...users, { userId: payload.userId, userName: payload.userName }];
      });

      // Automatically remove user after 5 seconds of inactivity as a safeguard
      const timeout = setTimeout(() => {
        this.typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
        this.typingTimeouts.delete(payload.userId);
      }, 5000);
      this.typingTimeouts.set(payload.userId, timeout);
    } else {
      // Remove user from typing list
      this.typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
    }
  }

  // Emits typing state over the active realtime channel broadcast
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

  // Builds the localized typing text string
  getTypingText(): string {
    const users = this.typingUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].userName} schreibt...`;
    if (users.length === 2) return `${users[0].userName} und ${users[1].userName} schreiben...`;
    return 'Mehrere Personen schreiben...';
  }

  // Opens the channel details dialog view
  openChannelDetails() {
    this.isChannelDetailsOpen = true;
  }

  // Closes the channel details dialog view
  closeChannelDetails() {
    this.isChannelDetailsOpen = false;
  }

  channelMembersInitialView: 'members' | 'add' = 'members';
  channelMembersPosition: 'right-110' | 'right-50' = 'right-110';

  // Opens the channel members list dialog
  openChannelMembers() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'members';
    this.channelMembersPosition = 'right-110';
  }

  // Closes the channel members dialog
  closeChannelMembers() {
    this.isChannelMembersOpen = false;
  }

  // Opens the members dialog directly on the add-member sub-view
  async onAddMember() {
    this.isChannelMembersOpen = true;
    this.channelMembersInitialView = 'add';
    this.channelMembersPosition = 'right-50';
  }

  // Adds selected members to the channel and refreshes the member list
  async onMembersAdded(memberResult: any) {
    if (!memberResult) return;

    const active = this.activeChannel();
    if (!active || !active.id) return;

    try {
      let memberIds: string[] = [];
      if (memberResult.selectionType === 'all') {
        const allUsers = await this.userSvc.getAllUsers();
        memberIds = allUsers.map((u) => u.id);
      } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
        memberIds = memberResult.selectedUsers;
      }

      if (memberIds.length > 0) {
        await this.channelSvc.addMembersToChannel(active.id, memberIds);

        // Reload channel members list in chat-area
        const dbMembers = await this.channelSvc.getChannelMembers(active.id);
        this.members.set(
          dbMembers.map((user) => ({
            id: user.id,
            name: user.display_name,
            avatar: user.avatar_url || 'img/avatars/avatar_default.svg',
          })),
        );
      }
    } catch (error) {
      console.error('Error adding members in chat area:', error);
    }
  }
}
