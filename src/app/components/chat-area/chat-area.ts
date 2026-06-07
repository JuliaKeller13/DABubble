import { Component, Input, inject, signal, effect, ViewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MessageInputComponent } from '../message-input/message-input';
import { MessageComponent } from '../message/message';
import { DialogChannelDetailsComponent } from '../dialog-channel-details/dialog-channel-details';
import { DialogChannelMembersComponent } from '../dialog-channel-members/dialog-channel-members';
import { MatDialogModule } from '@angular/material/dialog';
import { channelService } from '../../services/channel.service';
import { messageService } from '../../services/message.service';
import { authService } from '../../services/auth.service';
import { userService } from '../../services/user.service';
import { Message } from '../../interfaces/message.interface';
import { User } from '../../interfaces/user.interface';
import { Channel } from '../../interfaces/channel.interface';
import { ThreadService } from '../../services/thread.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { ToastService } from '../../services/toast.service';
import {
  buildGroupedMessages, checkAndScrollToSearchTarget, handleTypingBroadcast,
  getTypingText, scrollContainerToBottom, searchRecipients,
  addMembersToChannel, sendNewModeMessage, DateGroup,
} from './chat-area.helpers';

interface ChannelMember { id: string; name: string; avatar: string; }

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, MessageInputComponent, MessageComponent, DialogChannelDetailsComponent, DialogChannelMembersComponent, MatDialogModule, FormsModule],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.scss',
})
export class ChatAreaComponent implements OnDestroy {
  @Input() isSidebarClosed = false;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  public channelSvc = inject(channelService);
  public userSvc = inject(userService);
  private messageSvc = inject(messageService);
  private authSvc = inject(authService);
  private threadSvc = inject(ThreadService);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);
  private router = inject(Router);

  activeChannel = this.channelSvc.activeChannel;
  activeDirectChatUser = this.userSvc.activeDirectChatUser;
  isMessagesLoading = signal<boolean>(false);
  members = signal<ChannelMember[]>([]);
  messages = signal<Message[]>([]);
  typingUsers = signal<{ userId: string; userName: string }[]>([]);
  isHeaderMenuOpen = signal(false);
  isClearConfirmOpen = signal(false);
  isChannelDetailsOpen = false;
  isChannelMembersOpen = false;
  channelMembersInitialView: 'members' | 'add' = 'members';
  channelMembersPosition: 'right-110' | 'right-50' = 'right-110';
  isDragging = false;
  touchStartY = 0;
  currentTranslateY = 0;
  isAnimationActive = false;
  isClosing = false;
  recipientQuery = '';
  showSearchDropdown = false;
  selectedRecipient: any | null = null;
  selectedRecipientType: 'channel' | 'user' | null = null;
  filteredChannels: Channel[] = [];
  filteredUsers: User[] = [];

  private messagesSubscription: RealtimeChannel | null = null;
  private messageDeletedSubscription: Subscription | null = null;
  private optimisticReactionSubscription: Subscription | null = null;
  private directChatClearedSubscription: Subscription | null = null;
  private searchTargetSubscription: Subscription | null = null;
  private typingTimeouts = new Map<string, any>();

  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }
  get visibleMembers(): ChannelMember[] { return this.members().slice(0, 3); }
  get memberCount(): number { return this.members().length; }
  get groupedMessages(): DateGroup[] { return buildGroupedMessages(this.messages()); }

  constructor() {
    this.setupEventSubscriptions();
    this.setupMembersEffect();
    this.setupMessagesEffect();
  }

  private setupEventSubscriptions(): void {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.messages.update((prev) => prev.filter((m) => m.id !== id));
      if (this.threadSvc.activeMessage()?.id === id) this.threadSvc.closeThread();
    });
    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(({ targetUserId }) => {
      if (this.activeDirectChatUser()?.id === targetUserId) this.messages.set([]);
    });
    this.searchTargetSubscription = this.messageSvc.searchTargetSelected.subscribe(() => this.scrollToSearchTarget());
    this.optimisticReactionSubscription = this.messageSvc.optimisticReaction.subscribe(({ messageId, emoji, userId }) => {
      this.messages.update((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        let userIds = reactions[emoji] ? [...reactions[emoji]] : [];
        const i = userIds.indexOf(userId);
        if (i > -1) userIds.splice(i, 1); else userIds.push(userId);
        if (userIds.length === 0) delete reactions[emoji]; else reactions[emoji] = userIds;
        return { ...m, reactions };
      }));
    });
  }

  private setupMembersEffect(): void {
    effect(() => {
      const dbMembers = this.channelSvc.activeChannelMembers();
      const filtered = this.userSvc.filterDuplicateGuests(dbMembers, this.currentUserId);
      this.members.set(filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' })));
    });
    effect(() => {
      const channel = this.activeChannel();
      const targetUser = this.activeDirectChatUser();
      if (channel || targetUser) this.clearSelectedRecipient();
    });
  }

  private setupMessagesEffect(): void {
    effect(async () => {
      const channel = this.activeChannel();
      const targetUser = this.activeDirectChatUser();
      if (channel || targetUser) this.isMessagesLoading.set(true);
      if (!channel || targetUser) { this.isChannelDetailsOpen = false; this.isChannelMembersOpen = false; }
      if (this.messagesSubscription) { this.messageSvc.unsubscribe(this.messagesSubscription); this.messagesSubscription = null; }
      this.typingUsers.set([]);
      if (channel?.id) await this.loadChannelMessages(channel.id);
      else if (targetUser?.id) await this.loadDirectMessages(targetUser.id);
      else { this.messages.set([]); this.isMessagesLoading.set(false); }
    });
  }

  private async loadChannelMessages(channelId: string): Promise<void> {
    try {
      this.messages.set(await this.messageSvc.getChannelMessages(channelId));
      this.scrollToSearchTarget();
      this.messagesSubscription = this.messageSvc.subscribeToChannelMessages(channelId, (event, msg) => this.handleMessageEvent(event, msg), (p) => this.handleTypingBroadcast(p));
    } catch (error) { console.error('Error loading channel messages:', error); this.messages.set([]); }
    finally { this.isMessagesLoading.set(false); }
  }

  private async loadDirectMessages(userId: string): Promise<void> {
    try {
      this.messages.set(await this.messageSvc.getDirectMessages(this.currentUserId, userId));
      this.scrollToSearchTarget();
      this.messagesSubscription = this.messageSvc.subscribeToDirectMessages(this.currentUserId, userId, (event, msg) => this.handleMessageEvent(event, msg), (p) => this.handleTypingBroadcast(p));
    } catch (error) { console.error('Error loading direct messages:', error); this.messages.set([]); }
    finally { this.isMessagesLoading.set(false); }
  }

  private handleMessageEvent(event: 'INSERT' | 'UPDATE' | 'DELETE', msg: Message): void {
    if (event === 'INSERT') { this.messages.update((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]); scrollContainerToBottom(this.scrollContainer); }
    else if (event === 'UPDATE') this.messages.update((prev) => prev.map((m) => m.id === msg.id ? msg : m));
    else if (event === 'DELETE') this.messages.update((prev) => prev.filter((m) => m.id !== msg.id));
  }

  ngOnDestroy(): void {
    if (this.messagesSubscription) this.messageSvc.unsubscribe(this.messagesSubscription);
    this.messageDeletedSubscription?.unsubscribe();
    this.optimisticReactionSubscription?.unsubscribe();
    this.directChatClearedSubscription?.unsubscribe();
    this.searchTargetSubscription?.unsubscribe();
  }

  isUserOnline(user: User): boolean { return this.authSvc.onlineUserIds().has(user.id); }

  openActiveDirectChatProfile(): void {
    const activeUser = this.activeDirectChatUser();
    if (!activeUser) return;
    this.profileDialogSvc.open(activeUser, { suppressOutsideCloseOnce: activeUser.id === this.currentUserId });
  }

  private scrollToBottom(): void { scrollContainerToBottom(this.scrollContainer); }

  public checkAndScrollToSearchTarget(): void {
    checkAndScrollToSearchTarget(
      this.messageSvc.searchTargetMessageId,
      () => { if (this.messageSvc.searchTargetMessageId) this.messageSvc.searchTargetMessageId = null; },
      this.scrollContainer,
    );
  }

  private scrollToSearchTarget(): void { this.checkAndScrollToSearchTarget(); }

  async searchRecipients(): Promise<void> {
    const query = this.recipientQuery.trim();
    if (!query) { this.filteredChannels = []; this.filteredUsers = []; this.showSearchDropdown = false; return; }
    this.showSearchDropdown = true;
    const result = await searchRecipients(query, this.channelSvc, this.userSvc, this.currentUserId);
    this.filteredChannels = result.filteredChannels;
    this.filteredUsers = result.filteredUsers;
  }

  selectRecipient(recipient: any, type: 'channel' | 'user'): void {
    this.selectedRecipient = recipient;
    this.selectedRecipientType = type;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  clearSelectedRecipient(): void {
    this.selectedRecipient = null;
    this.selectedRecipientType = null;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isHeaderMenuOpen() && !target.closest('.chat-area__menu-container')) this.closeHeaderMenu();
    if (!target.closest('.chat-area__new-msg-recipient-container')) this.showSearchDropdown = false;
  }

  async onSendMessage(content: any): Promise<void> {
    if (typeof content !== 'string') return;
    if (this.channelSvc.isNewMessageModeActive()) {
      await sendNewModeMessage(content, this.selectedRecipient, this.selectedRecipientType, this.currentUserId, this.messageSvc, this.router);
      this.clearSelectedRecipient();
      return;
    }
    const channel = this.activeChannel();
    const dmUser = this.activeDirectChatUser();
    const userId = this.currentUserId;
    if (!userId) return;
    if (channel?.id) {
      const newMsg = await this.messageSvc.sendMessage(content, userId, channel.id);
      if (newMsg) { this.messages.update((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]); this.scrollToBottom(); }
    } else if (dmUser?.id && dmUser.id !== 'dabubble-team-local-id') {
      const newMsg = await this.messageSvc.sendDirectMessage(content, userId, dmUser.id);
      if (newMsg) { this.messages.update((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]); this.scrollToBottom(); }
    }
  }

  onThreadClicked(message: Message): void { this.threadSvc.openThread(message); }

  onMessageDeleted(messageId: string): void {
    this.messages.update((prev) => prev.filter((m) => m.id !== messageId));
    if (this.threadSvc.activeMessage()?.id === messageId) this.threadSvc.closeThread();
  }

  handleTypingBroadcast(payload: { userId: string; userName: string; isTyping: boolean }): void {
    handleTypingBroadcast(payload, this.currentUserId, this.typingUsers, this.typingTimeouts);
  }

  onTypingStatusChange(isTyping: boolean): void {
    const profile = this.authSvc.currentUserProfile();
    if (profile && this.messagesSubscription) this.messageSvc.sendTypingStatus(this.messagesSubscription, profile.id, profile.display_name, isTyping);
  }

  getTypingText(): string { return getTypingText(this.typingUsers()); }

  openChannelDetails(): void { this.isChannelDetailsOpen = true; }
  closeChannelDetails(): void { this.isChannelDetailsOpen = false; }
  openChannelMembers(): void { this.isChannelMembersOpen = true; this.channelMembersInitialView = 'members'; this.channelMembersPosition = 'right-110'; }
  closeChannelMembers(): void { this.isChannelMembersOpen = false; }
  onAddMember(): void { this.isChannelMembersOpen = true; this.channelMembersInitialView = 'add'; this.channelMembersPosition = 'right-50'; }

  async onMembersAdded(memberResult: any): Promise<void> {
    if (!memberResult) return;
    const active = this.activeChannel();
    if (!active?.id) return;
    try { await addMembersToChannel(memberResult, active.id, this.userSvc, this.channelSvc, this.currentUserId); }
    catch (error) { console.error('Error adding members in chat area:', error); }
  }

  async onMemberRemoved(_memberId: string): Promise<void> {
    const active = this.activeChannel();
    if (!active?.id) return;
    try { await this.channelSvc.refreshActiveChannelMembers(); }
    catch (error) { console.error('Error reloading members list after removal:', error); }
  }

  toggleHeaderMenu(): void { this.isHeaderMenuOpen.update((prev) => !prev); }
  closeHeaderMenu(): void { this.isHeaderMenuOpen.set(false); }

  async hideActiveChat(): Promise<void> {
    this.closeHeaderMenu();
    const targetUser = this.activeDirectChatUser();
    if (targetUser && this.currentUserId) {
      localStorage.setItem(`chat_closed:${this.currentUserId}:${targetUser.id}`, new Date().toISOString());
      const channels = await this.channelSvc.loadChannels();
      this.router.navigate(channels.length > 0 ? ['/main/channel', channels[0].id] : ['/main']);
    }
  }

  openClearConfirm(): void {
    this.closeHeaderMenu();
    this.isClearConfirmOpen.set(true);
    this.isAnimationActive = true;
    setTimeout(() => { this.isAnimationActive = false; }, 300);
  }

  cancelClearHistory(): void { this.isClearConfirmOpen.set(false); this.isAnimationActive = false; this.isClosing = false; }

  closeWithSlideDown(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 1200) { this.isClosing = true; setTimeout(() => this.cancelClearHistory(), 200); }
    else this.cancelClearHistory();
  }

  onTouchStart(event: TouchEvent): void { this.touchStartY = event.touches[0].clientY; this.isDragging = true; }

  onTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    if (event.cancelable) event.preventDefault();
    const delta = event.touches[0].clientY - this.touchStartY;
    this.currentTranslateY = delta > 0 ? delta : 0;
  }

  onTouchEnd(_event: TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.currentTranslateY > 80) this.cancelClearHistory();
    this.currentTranslateY = 0;
  }

  async confirmClearHistory(): Promise<void> {
    const targetUser = this.activeDirectChatUser();
    const currentUserId = this.currentUserId;
    if (targetUser && currentUserId) {
      const success = await this.messageSvc.deleteDirectChatHistory(currentUserId, targetUser.id);
      if (success) {
        this.messages.set([]);
        this.toastSvc.show('Chatverlauf gelöscht', 'success', 3000, undefined, false);
        localStorage.setItem(`chat_closed:${currentUserId}:${targetUser.id}`, new Date().toISOString());
        const channels = await this.channelSvc.loadChannels();
        this.router.navigate(channels.length > 0 ? ['/main/channel', channels[0].id] : ['/main']);
      } else {
        this.toastSvc.show('Fehler beim Löschen des Chatverlaufs', 'error', 3000, undefined, false);
      }
    }
    this.isClearConfirmOpen.set(false);
  }
}
