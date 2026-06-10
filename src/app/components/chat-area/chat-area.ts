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
/**
 * Component representing the main chat area where channel and direct messages are displayed and managed.
 */
export class ChatAreaComponent implements OnDestroy {
  /**
   * Whether the sidebar is currently closed.
   */
  @Input() isSidebarClosed = false;

  /**
   * The element reference to the message scroll container.
   */
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  /**
   * The injected ChannelService.
   */
  public channelSvc = inject(channelService);

  /**
   * The injected UserService.
   */
  public userSvc = inject(userService);

  /**
   * The injected MessageService.
   */
  private messageSvc = inject(messageService);

  /**
   * The injected AuthService.
   */
  private authSvc = inject(authService);

  /**
   * The injected ThreadService.
   */
  private threadSvc = inject(ThreadService);

  /**
   * The injected ProfileDialogService.
   */
  private profileDialogSvc = inject(ProfileDialogService);

  /**
   * The injected ToastService.
   */
  private toastSvc = inject(ToastService);

  /**
   * The injected Angular Router.
   */
  private router = inject(Router);

  /**
   * The currently active channel.
   */
  activeChannel = this.channelSvc.activeChannel;

  /**
   * The user currently selected for direct chat.
   */
  activeDirectChatUser = this.userSvc.activeDirectChatUser;

  /**
   * Signal indicating whether messages are currently loading.
   */
  isMessagesLoading = signal<boolean>(false);

  /**
   * Signal containing the members of the active channel.
   */
  members = signal<ChannelMember[]>([]);

  /**
   * Signal containing the list of messages in the active chat.
   */
  messages = signal<Message[]>([]);

  /**
   * Signal representing the users who are currently typing.
   */
  typingUsers = signal<{ userId: string; userName: string }[]>([]);

  /**
   * Signal representing whether the header menu is open.
   */
  isHeaderMenuOpen = signal(false);

  /**
   * Signal indicating whether the clear chat history confirmation dialog is open.
   */
  isClearConfirmOpen = signal(false);

  /**
   * Whether the channel details dialog is open.
   */
  isChannelDetailsOpen = false;

  /**
   * Whether the channel members list is open.
   */
  isChannelMembersOpen = false;

  /**
   * The initial view of the channel members popup ('members' or 'add').
   */
  channelMembersInitialView: 'members' | 'add' = 'members';

  /**
   * The positioning class name for the channel members dialog.
   */
  channelMembersPosition: 'right-110' | 'right-50' = 'right-110';

  /**
   * Whether the clear confirmation dialog is currently being dragged.
   */
  isDragging = false;

  /**
   * The starting Y coordinate of the touch gesture.
   */
  touchStartY = 0;

  /**
   * The current translateY value of the clear confirmation dialog during dragging.
   */
  currentTranslateY = 0;

  /**
   * Whether slide animations are active.
   */
  isAnimationActive = false;

  /**
   * Whether the clear confirmation dialog is closing.
   */
  isClosing = false;

  /**
   * The query string for searching message recipients.
   */
  recipientQuery = '';

  /**
   * Whether the recipient search dropdown is visible.
   */
  showSearchDropdown = false;

  /**
   * The currently selected recipient for a new message.
   */
  selectedRecipient: any | null = null;

  /**
   * The type of the selected recipient ('channel' or 'user').
   */
  selectedRecipientType: 'channel' | 'user' | null = null;

  /**
   * Filtered channels matching the search query.
   */
  filteredChannels: Channel[] = [];

  /**
   * Filtered users matching the search query.
   */
  filteredUsers: User[] = [];

  /**
   * Subscription for realtime channel messages.
   */
  private messagesSubscription: RealtimeChannel | null = null;

  /**
   * Subscription for message deletion events.
   */
  private messageDeletedSubscription: Subscription | null = null;

  /**
   * Subscription for optimistic reactions update events.
   */
  private optimisticReactionSubscription: Subscription | null = null;

  /**
   * Subscription for direct chat history cleared events.
   */
  private directChatClearedSubscription: Subscription | null = null;

  /**
   * Subscription for search target selected events.
   */
  private searchTargetSubscription: Subscription | null = null;

  /**
   * Timeouts mapped by user ID for clearing typing indicators.
   */
  private typingTimeouts = new Map<string, any>();

  /**
   * Gets the ID of the currently authenticated user.
   */
  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }

  /**
   * Gets the list of channel members visible in the header.
   */
  get visibleMembers(): ChannelMember[] { return this.members().slice(0, 3); }

  /**
   * Gets the total number of members in the channel.
   */
  get memberCount(): number { return this.members().length; }

  /**
   * Gets the messages grouped by their creation date.
   */
  get groupedMessages(): DateGroup[] { return buildGroupedMessages(this.messages()); }

  /**
   * Initializes the ChatAreaComponent.
   */
  constructor() {
    this.setupEventSubscriptions();
    this.setupMembersEffect();
    this.setupMessagesEffect();
  }

  /**
   * Subscribes to necessary message-related services.
   */
  private setupEventSubscriptions(): void {
    this.subscribeToMessageDeleted();
    this.subscribeToDirectChatCleared();
    this.subscribeToSearchTarget();
    this.subscribeToOptimisticReaction();
  }

  /**
   * Subscribes to the message deleted events to filter deleted messages out of the UI.
   */
  private subscribeToMessageDeleted(): void {
    this.messageDeletedSubscription = this.messageSvc.messageDeleted.subscribe((id) => {
      this.messages.update((prev) => prev.filter((m) => m.id !== id));
      if (this.threadSvc.activeMessage()?.id === id) this.threadSvc.closeThread();
    });
  }

  /**
   * Subscribes to the direct chat cleared event to reset messages if the active chat is cleared.
   */
  private subscribeToDirectChatCleared(): void {
    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(({ targetUserId }) => {
      if (this.activeDirectChatUser()?.id === targetUserId) this.messages.set([]);
    });
  }

  /**
   * Subscribes to the search target selected event to trigger scroll to the targeted message.
   */
  private subscribeToSearchTarget(): void {
    this.searchTargetSubscription = this.messageSvc.searchTargetSelected.subscribe(() => this.scrollToSearchTarget());
  }

  /**
   * Subscribes to optimistic reaction changes to update the local reaction lists.
   */
  private subscribeToOptimisticReaction(): void {
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

  /**
   * Sets up Angular effects to handle active channel members.
   */
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

  /**
   * Sets up Angular effects to subscribe to the active channel/user messages and handle updates.
   */
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

  /**
   * Loads the messages for a given channel and subscribes to realtime updates.
   * @param channelId - The ID of the channel to load messages for.
   * @returns A promise that resolves when the loading completes.
   */
  private async loadChannelMessages(channelId: string): Promise<void> {
    try {
      this.messages.set(await this.messageSvc.getChannelMessages(channelId));
      this.scrollToSearchTarget();
      this.messagesSubscription = this.messageSvc.subscribeToChannelMessages(channelId, (event, msg) => this.handleMessageEvent(event, msg), (p) => this.handleTypingBroadcast(p));
    } catch (error) { console.error('Error loading channel messages:', error); this.messages.set([]); }
    finally { this.isMessagesLoading.set(false); }
  }

  /**
   * Loads direct messages with the selected user and subscribes to realtime updates.
   * @param userId - The ID of the recipient user.
   * @returns A promise that resolves when the loading completes.
   */
  private async loadDirectMessages(userId: string): Promise<void> {
    try {
      this.messages.set(await this.messageSvc.getDirectMessages(this.currentUserId, userId));
      this.scrollToSearchTarget();
      this.messagesSubscription = this.messageSvc.subscribeToDirectMessages(this.currentUserId, userId, (event, msg) => this.handleMessageEvent(event, msg), (p) => this.handleTypingBroadcast(p));
    } catch (error) { console.error('Error loading direct messages:', error); this.messages.set([]); }
    finally { this.isMessagesLoading.set(false); }
  }

  /**
   * Handles incoming insert, update, or delete message events from the realtime subscription.
   * @param event - The type of event ('INSERT', 'UPDATE', or 'DELETE').
   * @param msg - The message object that triggered the event.
   */
  private handleMessageEvent(event: 'INSERT' | 'UPDATE' | 'DELETE', msg: Message): void {
    if (event === 'INSERT') { this.messages.update((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]); scrollContainerToBottom(this.scrollContainer); }
    else if (event === 'UPDATE') this.messages.update((prev) => prev.map((m) => m.id === msg.id ? msg : m));
    else if (event === 'DELETE') this.messages.update((prev) => prev.filter((m) => m.id !== msg.id));
  }

  /**
   * Component destruction lifecycle hook. Unsubscribes from all active subscriptions.
   */
  ngOnDestroy(): void {
    if (this.messagesSubscription) this.messageSvc.unsubscribe(this.messagesSubscription);
    this.messageDeletedSubscription?.unsubscribe();
    this.optimisticReactionSubscription?.unsubscribe();
    this.directChatClearedSubscription?.unsubscribe();
    this.searchTargetSubscription?.unsubscribe();
  }

  /**
   * Determines if a user is currently online.
   * @param user - The User to check.
   * @returns True if the user is online, false otherwise.
   */
  isUserOnline(user: User): boolean { return this.authSvc.onlineUserIds().has(user.id); }

  /**
   * Opens the profile dialog of the active direct chat partner.
   */
  openActiveDirectChatProfile(): void {
    const activeUser = this.activeDirectChatUser();
    if (!activeUser) return;
    this.profileDialogSvc.open(activeUser, { suppressOutsideCloseOnce: activeUser.id === this.currentUserId });
  }

  /**
   * Scrolls the messages container to the bottom.
   */
  private scrollToBottom(): void { scrollContainerToBottom(this.scrollContainer); }

  /**
   * Checks if a search target message is specified and scrolls it into view.
   */
  public checkAndScrollToSearchTarget(): void {
    checkAndScrollToSearchTarget(
      this.messageSvc.searchTargetMessageId,
      () => { if (this.messageSvc.searchTargetMessageId) this.messageSvc.searchTargetMessageId = null; },
      this.scrollContainer,
    );
  }

  /**
   * Initiates scrolling to the targeted search message.
   */
  private scrollToSearchTarget(): void { this.checkAndScrollToSearchTarget(); }

  /**
   * Searches for channels and users matching the current recipient query.
   * @returns A promise that resolves when the search operation completes.
   */
  async searchRecipients(): Promise<void> {
    const query = this.recipientQuery.trim();
    if (!query) { this.filteredChannels = []; this.filteredUsers = []; this.showSearchDropdown = false; return; }
    this.showSearchDropdown = true;
    const result = await searchRecipients(query, this.channelSvc, this.userSvc, this.currentUserId);
    this.filteredChannels = result.filteredChannels;
    this.filteredUsers = result.filteredUsers;
  }

  /**
   * Selects a recipient for a new message.
   * @param recipient - The selected recipient (user or channel object).
   * @param type - The recipient type ('channel' or 'user').
   */
  selectRecipient(recipient: any, type: 'channel' | 'user'): void {
    this.selectedRecipient = recipient;
    this.selectedRecipientType = type;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  /**
   * Clears the currently selected new message recipient.
   */
  clearSelectedRecipient(): void {
    this.selectedRecipient = null;
    this.selectedRecipientType = null;
    this.recipientQuery = '';
    this.showSearchDropdown = false;
  }

  /**
   * Document click listener to close popups and menus.
   * @param event - The mouse click event.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isHeaderMenuOpen() && !target.closest('.chat-area__menu-container')) this.closeHeaderMenu();
    if (!target.closest('.chat-area__new-msg-recipient-container')) this.showSearchDropdown = false;
  }

  /**
   * Handles sending a new message.
   * @param content - The text content of the message.
   * @returns A promise that resolves when the message is successfully sent.
   */
  async onSendMessage(content: any): Promise<void> {
    if (typeof content !== 'string') return;
    if (this.channelSvc.isNewMessageModeActive()) {
      await sendNewModeMessage(content, this.selectedRecipient, this.selectedRecipientType, this.currentUserId, this.messageSvc, this.router);
      return this.clearSelectedRecipient();
    }
    const userId = this.currentUserId;
    if (!userId) return;
    const channel = this.activeChannel();
    const dmUser = this.activeDirectChatUser();
    if (channel?.id) {
      await this.sendChannelMsg(content, userId, channel.id);
    } else if (dmUser?.id && dmUser.id !== 'dabubble-team-local-id') {
      await this.sendDMMsg(content, userId, dmUser.id);
    }
  }

  /**
   * Sends a message to a channel.
   * @param content - The text content of the message.
   * @param userId - The ID of the sender.
   * @param channelId - The ID of the destination channel.
   */
  private async sendChannelMsg(content: string, userId: string, channelId: string): Promise<void> {
    const newMsg = await this.messageSvc.sendMessage(content, userId, channelId);
    if (newMsg) {
      this.messages.update((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      this.scrollToBottom();
    }
  }

  /**
   * Sends a direct message to a user.
   * @param content - The text content of the message.
   * @param userId - The ID of the sender.
   * @param dmUserId - The ID of the recipient user.
   */
  private async sendDMMsg(content: string, userId: string, dmUserId: string): Promise<void> {
    const newMsg = await this.messageSvc.sendDirectMessage(content, userId, dmUserId);
    if (newMsg) {
      this.messages.update((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      this.scrollToBottom();
    }
  }

  /**
   * Handles click events on message threads.
   * @param message - The selected message thread parent.
   */
  onThreadClicked(message: Message): void { this.threadSvc.openThread(message); }

  /**
   * Event callback for message deleted events.
   * @param messageId - The ID of the deleted message.
   */
  onMessageDeleted(messageId: string): void {
    this.messages.update((prev) => prev.filter((m) => m.id !== messageId));
    if (this.threadSvc.activeMessage()?.id === messageId) this.threadSvc.closeThread();
  }

  /**
   * Handles typing broadcast payloads to update list of typing users.
   * @param payload - The typing status payload.
   */
  handleTypingBroadcast(payload: { userId: string; userName: string; isTyping: boolean }): void {
    handleTypingBroadcast(payload, this.currentUserId, this.typingUsers, this.typingTimeouts);
  }

  /**
   * Updates typing status and broadcasts it to the chat channel.
   * @param isTyping - Whether the user is currently typing.
   */
  onTypingStatusChange(isTyping: boolean): void {
    const profile = this.authSvc.currentUserProfile();
    if (profile && this.messagesSubscription) this.messageSvc.sendTypingStatus(this.messagesSubscription, profile.id, profile.display_name, isTyping);
  }

  /**
   * Gets the descriptive text of users currently typing.
   * @returns Formatted typing status text.
   */
  getTypingText(): string { return getTypingText(this.typingUsers()); }

  /**
   * Opens the channel details dialog.
   */
  openChannelDetails(): void { this.isChannelDetailsOpen = true; }

  /**
   * Closes the channel details dialog.
   */
  closeChannelDetails(): void { this.isChannelDetailsOpen = false; }

  /**
   * Closes the channel details dialog and opens the add member view.
   */
  openAddMemberFromDetails(): void {
    this.isChannelDetailsOpen = false;
    this.onAddMember();
  }

  /**
   * Opens the channel members list popup.
   */
  openChannelMembers(): void { this.isChannelMembersOpen = true; this.channelMembersInitialView = 'members'; this.channelMembersPosition = 'right-110'; }

  /**
   * Closes the channel members list popup.
   */
  closeChannelMembers(): void { this.isChannelMembersOpen = false; }

  /**
   * Opens the add member view inside the channel members popup.
   */
  onAddMember(): void { this.isChannelMembersOpen = true; this.channelMembersInitialView = 'add'; this.channelMembersPosition = 'right-50'; }

  /**
   * Handles additions of members to the channel.
   * @param memberResult - Selected members details.
   */
  async onMembersAdded(memberResult: any): Promise<void> {
    if (!memberResult) return;
    const active = this.activeChannel();
    if (!active?.id) return;
    try { await addMembersToChannel(memberResult, active.id, this.userSvc, this.channelSvc, this.currentUserId); }
    catch (error) { console.error('Error adding members in chat area:', error); }
  }

  /**
   * Handles user member removal.
   * @param _memberId - The ID of the removed member.
   */
  async onMemberRemoved(_memberId: string): Promise<void> {
    const active = this.activeChannel();
    if (!active?.id) return;
    try { await this.channelSvc.refreshActiveChannelMembers(); }
    catch (error) { console.error('Error reloading members list after removal:', error); }
  }

  /**
   * Toggles the chat header menu open state.
   */
  toggleHeaderMenu(): void { this.isHeaderMenuOpen.update((prev) => !prev); }

  /**
   * Closes the chat header menu.
   */
  closeHeaderMenu(): void { this.isHeaderMenuOpen.set(false); }

  /**
   * Hides the active chat by storing closed state locally and navigating away.
   */
  async hideActiveChat(): Promise<void> {
    this.closeHeaderMenu();
    const targetUser = this.activeDirectChatUser();
    if (targetUser && this.currentUserId) {
      localStorage.setItem(`chat_closed:${this.currentUserId}:${targetUser.id}`, new Date().toISOString());
      const channels = await this.channelSvc.loadChannels();
      this.router.navigate(channels.length > 0 ? ['/main/channel', channels[0].id] : ['/main']);
    }
  }

  /**
   * Opens the clear direct chat history confirmation dialog.
   */
  openClearConfirm(): void {
    this.closeHeaderMenu();
    this.isClearConfirmOpen.set(true);
    this.isAnimationActive = true;
    setTimeout(() => { this.isAnimationActive = false; }, 300);
  }

  /**
   * Cancels direct chat history clearance.
   */
  cancelClearHistory(): void { this.isClearConfirmOpen.set(false); this.isAnimationActive = false; this.isClosing = false; }

  /**
   * Closes the clear confirm dialog using slide down animation on mobile devices.
   */
  closeWithSlideDown(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 1200) { this.isClosing = true; setTimeout(() => this.cancelClearHistory(), 200); }
    else this.cancelClearHistory();
  }

  /**
   * Handles touchstart events for dragging the clear confirmation panel.
   * @param event - Touch event.
   */
  onTouchStart(event: TouchEvent): void { this.touchStartY = event.touches[0].clientY; this.isDragging = true; }

  /**
   * Handles touchmove events for dragging the clear confirmation panel.
   * @param event - Touch event.
   */
  onTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    if (event.cancelable) event.preventDefault();
    const delta = event.touches[0].clientY - this.touchStartY;
    this.currentTranslateY = delta > 0 ? delta : 0;
  }

  /**
   * Handles touchend events for dragging the clear confirmation panel.
   * @param _event - Touch event.
   */
  onTouchEnd(_event: TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.currentTranslateY > 80) this.cancelClearHistory();
    this.currentTranslateY = 0;
  }

  /**
   * Confirms and deletes direct chat history.
   */
  async confirmClearHistory(): Promise<void> {
    const targetUser = this.activeDirectChatUser();
    const currentUserId = this.currentUserId;
    if (targetUser && currentUserId) {
      const success = await this.messageSvc.deleteDirectChatHistory(currentUserId, targetUser.id);
      if (success) {
        await this.handleHistoryCleared(currentUserId, targetUser.id);
      } else {
        this.toastSvc.show('Fehler beim Löschen des Chatverlaufs', 'error', 3000, undefined, false);
      }
    }
    this.isClearConfirmOpen.set(false);
  }

  /**
   * Internal handler to reset UI and save closed state once history is cleared.
   * @param currentUserId - The current user's ID.
   * @param targetUserId - The direct chat partner's ID.
   */
  private async handleHistoryCleared(currentUserId: string, targetUserId: string): Promise<void> {
    this.messages.set([]);
    this.toastSvc.show('Chatverlauf gelöscht', 'success', 3000, undefined, false);
    localStorage.setItem(`chat_closed:${currentUserId}:${targetUserId}`, new Date().toISOString());
    const channels = await this.channelSvc.loadChannels();
    this.router.navigate(channels.length > 0 ? ['/main/channel', channels[0].id] : ['/main']);
  }
}
