import { Component, inject, signal, effect, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MessageInputComponent } from '../message-input/message-input';
import { MessageComponent } from '../message/message';
import { ThreadService } from '../../services/thread.service';
import { messageService } from '../../services/message.service';
import { authService } from '../../services/auth.service';
import { Message } from '../../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-thread-view',
  standalone: true,
  imports: [CommonModule, MessageInputComponent, MessageComponent],
  templateUrl: './thread-view.html',
  styleUrl: './thread-view.scss',
})
/**
 * Component representing the side panel for a message reply thread, showing the parent message and its replies.
 */
export class ThreadViewComponent implements OnDestroy {
  /** The injected ThreadService managing active thread states. */
  public threadSvc = inject(ThreadService);
  /** The injected MessageService. */
  private messageSvc = inject(messageService);
  /** The injected AuthService. */
  private authSvc = inject(authService);

  /** Element reference to the replies scroll container. */
  @ViewChild('repliesContainer') private repliesContainer!: ElementRef;

  /** Signal holding the list of replies in the current thread. */
  replies = signal<Message[]>([]);
  /** Signal indicating if replies are currently loading. */
  isRepliesLoading = signal<boolean>(false);
  /** Realtime database subscription channel for thread replies. */
  private repliesSubscription: RealtimeChannel | null = null;
  /** Subscription for parent message deletion events. */
  private messageDeletedSubscription: Subscription | null = null;
  /** Subscription for optimistic reaction updates. */
  private optimisticReactionSubscription: Subscription | null = null;
  /** Subscription for scrolling to search targets. */
  private searchTargetSubscription: Subscription | null = null;
  /** Signal containing the list of users typing replies in this thread. */
  typingUsers = signal<{ userId: string; userName: string }[]>([]);
  /** Map of timeouts by user ID to clear typing indicators. */
  private typingTimeouts = new Map<string, any>();

  /**
   * Gets the ID of the currently logged-in user.
   */
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  /**
   * Initializes the ThreadViewComponent, subscribing to message deletion,
   * search selection, optimistic reactions, and changes in the active parent message.
   */
  constructor() {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.replies.update((prev) => prev.filter((r) => r.id !== id));
      const parentMsg = this.threadSvc.activeMessage();
      if (parentMsg && parentMsg.id === id) {
        this.threadSvc.closeThread();
      }
    });

    this.searchTargetSubscription = this.messageSvc.searchTargetSelected.subscribe((messageId) => {
      this.checkAndScrollToSearchTarget();
    });

    this.optimisticReactionSubscription = this.messageSvc.optimisticReaction.subscribe(({ messageId, emoji, userId }) => {
      this.replies.update((prev) => prev.map((m) => {
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

      const parentMsg = this.threadSvc.activeMessage();
      if (parentMsg && parentMsg.id === messageId) {
        const reactions = { ...(parentMsg.reactions || {}) };
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
        this.threadSvc.activeMessage.set({ ...parentMsg, reactions });
      }
    });

    effect(async () => {
      const parentMsg = this.threadSvc.activeMessage();

      if (parentMsg && parentMsg.id) {
        this.isRepliesLoading.set(true);
      }

      if (this.repliesSubscription) {
        this.messageSvc.unsubscribe(this.repliesSubscription);
        this.repliesSubscription = null;
      }

      if (parentMsg && parentMsg.id) {
        try {
          const dbReplies = await this.messageSvc.getThreadReplies(parentMsg.id);
          this.replies.set(dbReplies);
          this.checkAndScrollToSearchTarget();

          this.repliesSubscription = this.messageSvc.subscribeToThreadReplies(
            parentMsg.id,
            (event, msg) => {
              if (event === 'INSERT') {
                this.replies.update(prev => {
                  if (prev.some(m => m.id === msg.id)) return prev;
                  return [...prev, msg];
                });
                this.scrollToBottom();
              } else if (event === 'UPDATE') {
                this.replies.update(prev => prev.map(m => m.id === msg.id ? msg : m));
              } else if (event === 'DELETE') {
                this.replies.update(prev => prev.filter(m => m.id !== msg.id));
              }
            },
            (typingPayload) => {
              this.handleTypingBroadcast(typingPayload);
            }
          );
        } catch (error) {
          console.error('Error loading thread replies:', error);
          this.replies.set([]);
        } finally {
          this.isRepliesLoading.set(false);
        }
      } else {
        this.replies.set([]);
        this.isRepliesLoading.set(false);
      }
    });
  }

  /**
   * Component destruction lifecycle hook. Unsubscribes from active database channels and event streams.
   */
  ngOnDestroy() {
    if (this.repliesSubscription) {
      this.messageSvc.unsubscribe(this.repliesSubscription);
    }
    if (this.messageDeletedSubscription) {
      this.messageDeletedSubscription.unsubscribe();
    }
    if (this.optimisticReactionSubscription) {
      this.optimisticReactionSubscription.unsubscribe();
    }
    if (this.searchTargetSubscription) {
      this.searchTargetSubscription.unsubscribe();
    }
  }

  /**
   * Handles typing broadcast updates inside the thread view, displaying and clearing typing indicators.
   * @param payload - The typing broadcast payload.
   */
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

  /**
   * Updates typing status and broadcasts it to the thread channel.
   * @param isTyping - Active typing status.
   */
  onTypingStatusChange(isTyping: boolean) {
    const profile = this.authSvc.currentUserProfile();
    if (profile && this.repliesSubscription) {
      this.messageSvc.sendTypingStatus(
        this.repliesSubscription,
        profile.id,
        profile.display_name,
        isTyping
      );
    }
  }

  /**
   * Gets visual typing display text summarizing who is typing.
   */
  getTypingText(): string {
    const users = this.typingUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].userName} schreibt...`;
    if (users.length === 2) return `${users[0].userName} und ${users[1].userName} schreiben...`;
    return 'Mehrere Personen schreiben...';
  }

  /**
   * Closes the active thread side panel.
   */
  onClose() {
    this.threadSvc.closeThread();
  }

  /**
   * Event handler when the parent message is deleted.
   * @param _parentId - Deleted parent message ID.
   */
  onParentDeleted(_parentId: string) {
    this.threadSvc.closeThread();
  }

  /**
   * Event handler when a reply is deleted.
   * @param replyId - Deleted reply ID.
   */
  onReplyDeleted(replyId: string) {
    this.replies.update(prev => prev.filter(r => r.id !== replyId));
  }

  /**
   * Sends a reply message to the database.
   * @param content - Reply content string.
   */
  async onSendReply(content: any) {
    if (typeof content !== 'string' || !content.trim()) return;
    const parentMsg = this.threadSvc.activeMessage();
    if (!parentMsg || !parentMsg.id) return;

    const userId = this.currentUserId;
    if (!userId) return;

    const recipientId = parentMsg.recipient_id
      ? (parentMsg.recipient_id === userId ? parentMsg.sender_id : parentMsg.recipient_id)
      : undefined;

    const newReply = await this.messageSvc.sendMessage(
      content, 
      userId, 
      parentMsg.channel_id || '', 
      parentMsg.id,
      recipientId
    );

    if (newReply) {
      this.replies.update(prev => {
        if (prev.some(m => m.id === newReply.id)) return prev;
        return [...prev, newReply];
      });
      this.scrollToBottom();
    }
  }

  /**
   * Scrolls the replies scroll container to the bottom.
   */
  private scrollToBottom() {
    setTimeout(() => {
      if (this.repliesContainer) {
        const element = this.repliesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  /**
   * Checks for a search target message and scrolls it into view, falling back to bottom if not found.
   */
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
}
