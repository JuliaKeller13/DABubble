import { Component, Input, Output, EventEmitter, inject, ElementRef, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../interfaces/message.interface';
import { MessageService } from '../../services/message.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { ToastService } from '../../services/toast.service';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { ThreadService } from '../../services/thread.service';
import { User } from '../../interfaces/user.interface';

interface MessageToken {
  type: 'text' | 'channel' | 'mention';
  text: string;
  channelId?: string;
  userId?: string;
}

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message.html',
  styleUrl: './message.scss',
})
export class MessageComponent implements OnInit {
  private _message!: Message;

  @Input({ required: true }) set message(val: Message) {
    this._message = val;
    this.parseMessageContent();
  }
  get message(): Message {
    return this._message;
  }

  @Input({ required: true }) currentUserId!: string;
  @Input() isThreadMessage = false;

  @Output() threadClick = new EventEmitter<Message>();
  @Output() editClick = new EventEmitter<Message>();
  @Output() delete = new EventEmitter<string>();

  private messageSvc = inject(MessageService);
  private elementRef = inject(ElementRef);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);
  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private threadSvc = inject(ThreadService);
  private cdr = inject(ChangeDetectorRef);

  showReactionPicker = false;
  showHoverReactionPicker = false;
  showMoreMenu = false;
  isEditing = false;
  editContent = '';

  private static allUsers: User[] = [];
  tokens: MessageToken[] = [];

  // Toggles the visibility of the message options menu
  toggleMoreOptions() {
    this.showMoreMenu = !this.showMoreMenu;
  }

  // Emojis offered in the quick reaction bar
  quickEmojis = ['🚀', '✅', '👍', '❤️', '😂', '😮'];

  // Retrieves the number of replies in this message thread
  get replyCount(): number {
    return (this.message as any).reply_count || 0;
  }

  // Get last reply time formatted (mocked or retrieved)
  get formattedLastReplyTime(): string {
    const time = (this.message as any).last_reply_time;
    if (!time) return '';
    const date = new Date(time);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  }

  // Check if the current message belongs to the logged-in user
  get isCurrentUser(): boolean {
    return this.message.sender_id === this.currentUserId;
  }

  // Format the creation date to HH:MM Uhr format
  get formattedTime(): string {
    if (!this.message.created_at) return '';
    const date = new Date(this.message.created_at);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins} Uhr`;
  }

  // Group and format active reactions on this message for display
  get reactionList() {
    if (!this.message.reactions) return [];
    return Object.entries(this.message.reactions).map(([emoji, userIds]) => {
      return {
        emoji,
        count: userIds.length,
        userReacted: userIds.includes(this.currentUserId),
        userIds,
      };
    });
  }

  // Toggle reaction on the message using the current user's profile
  async toggleReaction(emoji: string) {
    this.showReactionPicker = false;
    this.showHoverReactionPicker = false;
    if (!this.message.id) return;
    await this.messageSvc.toggleReaction(this.message.id, emoji, this.currentUserId);
  }

  // Closes all popups when a click occurs outside the message component
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showReactionPicker = false;
      this.showHoverReactionPicker = false;
      this.showMoreMenu = false;
      this.showEditEmojiPicker = false;
    }
  }

  showEditEmojiPicker = false;

  // Trigger opening the message thread view
  onStartThread() {
    this.threadClick.emit(this.message);
  }

  // Opens the profile dialog of the sender of this message
  openSenderProfile(): void {
    if (!this.message.sender) {
      return;
    }

    this.profileDialogSvc.open(this.message.sender, { suppressOutsideCloseOnce: this.isCurrentUser });
  }

  // Enable editing state for the message
  startEdit() {
    this.isEditing = true;
    this.editContent = this.message.content;
    this.showEditEmojiPicker = false;
  }

  // Cancel the message editing action
  cancelEdit() {
    this.isEditing = false;
    this.showEditEmojiPicker = false;
  }

  // Toggle emoji picker in edit mode
  toggleEditEmojiPicker() {
    this.showEditEmojiPicker = !this.showEditEmojiPicker;
  }

  // Add selected emoji to editing content
  addEmojiToEdit(emoji: string) {
    this.editContent += emoji;
    this.showEditEmojiPicker = false;
  }

  // Listen to keydown events in the edit textarea
  onEditKeyDown(event: any) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.saveEdit();
    } else if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      this.cancelEdit();
    }
  }

  async ngOnInit() {
    if (MessageComponent.allUsers.length === 0) {
      try {
        MessageComponent.allUsers = await this.userSvc.getAllUsers();
      } catch (e) {
        console.error('Fehler beim Laden der User im MessageComponent-Init:', e);
      }
    }
    
    // Defer initial parse to prevent ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.parseMessageContent();
      this.cdr.markForCheck();
    }, 0);
  }

  parseMessageContent() {
    const content = this.message?.content || '';
    if (!content) {
      this.tokens = [];
      this.cdr.markForCheck();
      return;
    }

    if (MessageComponent.allUsers.length > 0) {
      this.executeParsing(content);
    } else {
      this.userSvc.getAllUsers().then(users => {
        MessageComponent.allUsers = users;
        setTimeout(() => {
          this.executeParsing(content);
          this.cdr.markForCheck();
        }, 0);
      }).catch(e => {
        console.error('Fehler beim Laden der User für Message-Parsing:', e);
        setTimeout(() => {
          this.executeParsing(content);
          this.cdr.markForCheck();
        }, 0);
      });
    }
  }

  private executeParsing(content: string) {
    const channels = this.channelSvc.channels();
    const users = MessageComponent.allUsers;
    const searchTerms: { text: string; type: 'channel' | 'mention'; id: string }[] = [];

    channels.forEach(ch => {
      if (ch.name) {
        searchTerms.push({
          text: '#' + ch.name,
          type: 'channel',
          id: ch.id || ''
        });
      }
    });

    users.forEach(u => {
      if (u.display_name) {
        searchTerms.push({
          text: '@' + u.display_name,
          type: 'mention',
          id: u.id
        });
      }
    });

    searchTerms.sort((a, b) => b.text.length - a.text.length);

    const result: MessageToken[] = [];
    let remainingText = content;

    while (remainingText.length > 0) {
      let earliestMatchIndex = -1;
      let matchingTerm: typeof searchTerms[0] | null = null;

      for (const term of searchTerms) {
        const index = remainingText.indexOf(term.text);
        if (index !== -1) {
          if (earliestMatchIndex === -1 || index < earliestMatchIndex) {
            earliestMatchIndex = index;
            matchingTerm = term;
          }
        }
      }

      if (matchingTerm && earliestMatchIndex !== -1) {
        if (earliestMatchIndex > 0) {
          result.push({
            type: 'text',
            text: remainingText.substring(0, earliestMatchIndex)
          });
        }

        result.push({
          type: matchingTerm.type,
          text: matchingTerm.text,
          channelId: matchingTerm.type === 'channel' ? matchingTerm.id : undefined,
          userId: matchingTerm.type === 'mention' ? matchingTerm.id : undefined
        });

        remainingText = remainingText.substring(earliestMatchIndex + matchingTerm.text.length);
      } else {
        result.push({
          type: 'text',
          text: remainingText
        });
        break;
      }
    }

    this.tokens = result;
    this.cdr.markForCheck();
  }

  onChannelClick(channelId: string) {
    const channel = this.channelSvc.channels().find(c => c.id === channelId);
    if (channel) {
      this.channelSvc.selectChannel(channel);
      this.userSvc.selectDirectChatUser(null);
      this.threadSvc.closeThread();
    }
  }

  onUserClick(userId: string) {
    const user = MessageComponent.allUsers.find(u => u.id === userId);
    if (user) {
      this.profileDialogSvc.open(user, { suppressOutsideCloseOnce: userId === this.currentUserId });
    }
  }

  // Save the updated message content to Supabase
  async saveEdit() {
    if (!this.message.id || !this.editContent.trim()) return;
    try {
      const { error } = await this.messageSvc['supabaseSvc'].supabase
        .from('messages')
        .update({ content: this.editContent })
        .eq('id', this.message.id);

      if (!error) {
        this.message.content = this.editContent;
        this.parseMessageContent();
        this.isEditing = false;
        this.showEditEmojiPicker = false;
      }
    } catch (err) {
      console.error('Failed to save message edit:', err);
    }
  }

  // Trigger delete confirmation for this message
  async deleteMessage() {
    if (!this.message.id) return;
    const msgId = this.message.id;
    this.delete.emit(msgId);
    await this.messageSvc.deleteMessage(msgId);
    this.toastSvc.show('Nachricht gelöscht', 'success', 3000, undefined, false);
  }
}
