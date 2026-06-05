import { Component, inject, signal, effect, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MessageInputComponent } from '../message-input/message-input';
import { MessageComponent } from '../message/message';
import { ThreadService } from '../../services/thread.service';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import { Message } from '../../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-thread-view',
  standalone: true,
  imports: [CommonModule, MessageInputComponent, MessageComponent],
  templateUrl: './thread-view.html',
  styleUrl: './thread-view.scss',
})
export class ThreadViewComponent implements OnDestroy {
  public threadSvc = inject(ThreadService);
  private messageSvc = inject(MessageService);
  private authSvc = inject(AuthService);

  @ViewChild('repliesContainer') private repliesContainer!: ElementRef;

  replies = signal<Message[]>([]);
  private repliesSubscription: RealtimeChannel | null = null;
  private messageDeletedSubscription: Subscription | null = null;
  typingUsers = signal<{ userId: string; userName: string }[]>([]);
  private typingTimeouts = new Map<string, any>();

  
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  
  constructor() {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.replies.update((prev) => prev.filter((r) => r.id !== id));
      const parentMsg = this.threadSvc.activeMessage();
      if (parentMsg && parentMsg.id === id) {
        this.threadSvc.closeThread();
      }
    });

    
    effect(async () => {
      const parentMsg = this.threadSvc.activeMessage();

      
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
        }
      } else {
        this.replies.set([]);
      }
    });
  }

  
  ngOnDestroy() {
    if (this.repliesSubscription) {
      this.messageSvc.unsubscribe(this.repliesSubscription);
    }
    if (this.messageDeletedSubscription) {
      this.messageDeletedSubscription.unsubscribe();
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
    if (profile && this.repliesSubscription) {
      this.messageSvc.sendTypingStatus(
        this.repliesSubscription,
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

  
  onClose() {
    this.threadSvc.closeThread();
  }

  
  onParentDeleted(parentId: string) {
    this.threadSvc.closeThread();
  }

  
  onReplyDeleted(replyId: string) {
    this.replies.update(prev => prev.filter(r => r.id !== replyId));
  }

  
  async onSendReply(content: any) {
    if (typeof content !== 'string' || !content.trim()) return;
    const parentMsg = this.threadSvc.activeMessage();
    if (!parentMsg || !parentMsg.id) return;

    const userId = this.currentUserId;
    if (!userId) return;

    
    const newReply = await this.messageSvc.sendMessage(
      content, 
      userId, 
      parentMsg.channel_id || '', 
      parentMsg.id
    );

    if (newReply) {
      this.replies.update(prev => {
        if (prev.some(m => m.id === newReply.id)) return prev;
        return [...prev, newReply];
      });
      this.scrollToBottom();
    }
  }

  
  private scrollToBottom() {
    setTimeout(() => {
      if (this.repliesContainer) {
        const element = this.repliesContainer.nativeElement;
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
}
