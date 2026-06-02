import { Component, Input, inject, signal, effect, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { RealtimeChannel } from '@supabase/supabase-js';

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
    MatDialogModule
  ],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss'
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

  // Expose active channel from the shared service
  activeChannel = this.channelSvc.activeChannel;

  members = signal<ChannelMember[]>([]);
  messages = signal<Message[]>([]);
  private messagesSubscription: RealtimeChannel | null = null;

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
    // Effect 1: Channel Members
    effect(async () => {
      const channel = this.activeChannel();
      if (channel && channel.id) {
        try {
          const dbMembers = await this.channelSvc.getChannelMembers(channel.id);
          this.members.set(dbMembers.map(user => ({
            id: user.id,
            name: user.display_name,
            avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
          })));
        } catch (error) {
          console.error('Error loading channel members:', error);
          this.members.set([]);
        }
      } else {
        this.members.set([]);
      }
    });

    // Effect 2: Channel Messages and Realtime Updates
    effect(async () => {
      const channel = this.activeChannel();

      // Cleanup previous subscription
      if (this.messagesSubscription) {
        this.messageSvc.unsubscribe(this.messagesSubscription);
        this.messagesSubscription = null;
      }

      if (channel && channel.id) {
        try {
          // Fetch historical channel messages
          const dbMessages = await this.messageSvc.getChannelMessages(channel.id);
          this.messages.set(dbMessages);
          this.scrollToBottom();

          // Create realtime subscription for live insertions and updates
          this.messagesSubscription = this.messageSvc.subscribeToChannelMessages(
            channel.id,
            (event, msg) => {
              if (event === 'INSERT') {
                this.messages.update(prev => {
                  if (prev.some(m => m.id === msg.id)) return prev;
                  return [...prev, msg];
                });
                this.scrollToBottom();
              } else if (event === 'UPDATE') {
                this.messages.update(prev => prev.map(m => m.id === msg.id ? msg : m));
              } else if (event === 'DELETE') {
                this.messages.update(prev => prev.filter(m => m.id !== msg.id));
              }
            }
          );
        } catch (error) {
          console.error('Error loading channel messages:', error);
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
  }

  // Group messages dynamically by their formatted creation date label
  get groupedMessages(): DateGroup[] {
    const groups: DateGroup[] = [];
    this.messages().forEach(msg => {
      const label = this.getDateLabel(msg.created_at);
      let group = groups.find(g => g.dateLabel === label);
      if (!group) {
        group = { dateLabel: label, messages: [] };
        groups.push(group);
      }
      group.messages.push(msg);
    });
    return groups;
  }

  // Generate date labels (Heute, Gestern, or localized weekdays)
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
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      const formatted = date.toLocaleDateString('de-DE', options);
      return formatted.replace('.', ''); // Removes the dot after the day number (e.g. "14. Januar" -> "14 Januar")
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

  // Send a new message to the active channel
  async onSendMessage(content: any) {
    if (typeof content !== 'string') return;
    const channel = this.activeChannel();

    if (!channel || !channel.id) {
      console.warn('[onSendMessage] No active channel');
      return;
    }
    
    const userId = this.currentUserId;
    if (!userId) {
      console.warn('[onSendMessage] Current user ID is null/empty');
      return;
    }

    const newMsg = await this.messageSvc.sendMessage(content, userId, channel.id);
    if (newMsg) {
      this.messages.update(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      this.scrollToBottom();
    } else {
      console.error('[onSendMessage] Failed to send message to database');
    }
  }

  // Placeholder handler for starting threads
  onThreadClicked(message: Message) {
    // Thread trigger hook
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
        memberIds = allUsers.map(u => u.id);
      } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
        memberIds = memberResult.selectedUsers;
      }

      if (memberIds.length > 0) {
        await this.channelSvc.addMembersToChannel(active.id, memberIds);
        
        // Reload channel members list in chat-area
        const dbMembers = await this.channelSvc.getChannelMembers(active.id);
        this.members.set(dbMembers.map(user => ({
          id: user.id,
          name: user.display_name,
          avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
        })));
      }
    } catch (error) {
      console.error('Error adding members in chat area:', error);
    }
  }
}
