import { WritableSignal } from '@angular/core';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';
import { messageService } from '../../services/message.service';

export type PopupType = 'none' | 'users' | 'channels';

export interface PopupUser { id: string; name: string; avatar: string; }
export interface PopupChannel { id: string; name: string; }

export class MessageInputPopupHelper {
  activePopup: PopupType = 'none';
  popupUsers: PopupUser[] = [];
  popupChannels: PopupChannel[] = [];
  isLoading = false;

  private allPopupUsers: PopupUser[] = [];
  private allPopupChannels: PopupChannel[] = [];

  private static channelMembersCache = new Map<string, PopupUser[]>();
  static allUsersCache: PopupUser[] = [];

  constructor(
    private channelSvc: channelService,
    private userSvc: userService,
    private authSvc: authService,
    private threadSvc: ThreadService,
    private messageSvc: messageService,
    private getTextarea: () => HTMLTextAreaElement | null,
    private getMessageText: () => string,
    private setMessageText: (val: string) => void,
    private syncScroll: () => void,
  ) {}

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  get isMentionActive(): boolean {
    return this.activePopup !== 'none';
  }

  async toggleMention(): Promise<void> {
    if (this.activePopup === 'none') {
      this.activePopup = 'users';
      await this.loadUsers();
    } else if (this.activePopup === 'users') {
      this.activePopup = 'channels';
      await this.loadChannels();
    } else {
      this.activePopup = 'none';
    }
  }

  async loadUsers(): Promise<void> {
    const channel = this.channelSvc.activeChannel();
    const activeMsg = this.threadSvc.activeMessage();
    const channelId = (activeMsg?.channel_id) || (channel?.id) || '';

    if (channelId && channelId === channel?.id && this.channelSvc.activeChannelMembers().length > 0) {
      const filtered = this.userSvc.filterDuplicateGuests(this.channelSvc.activeChannelMembers(), this.currentUserId || null);
      this.allPopupUsers = filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' }));
      MessageInputPopupHelper.channelMembersCache.set(channelId, this.allPopupUsers);
      this.popupUsers = [...this.allPopupUsers];
      return;
    }
    if (channelId && MessageInputPopupHelper.channelMembersCache.has(channelId)) {
      this.allPopupUsers = MessageInputPopupHelper.channelMembersCache.get(channelId)!;
      this.popupUsers = [...this.allPopupUsers];
      return;
    }
    if (!channelId && MessageInputPopupHelper.allUsersCache.length > 0) {
      this.allPopupUsers = MessageInputPopupHelper.allUsersCache;
      this.popupUsers = [...this.allPopupUsers];
      return;
    }
    await this.fetchUsersFromDb(channelId);
  }

  private async fetchUsersFromDb(channelId: string): Promise<void> {
    this.isLoading = true;
    try {
      if (channelId) {
        const dbMembers = await this.channelSvc.getChannelMembers(channelId);
        const filtered = this.userSvc.filterDuplicateGuests(dbMembers, this.currentUserId || null);
        const mapped = filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' }));
        MessageInputPopupHelper.channelMembersCache.set(channelId, mapped);
        this.allPopupUsers = mapped;
      } else {
        const allUsers = await this.userSvc.getAllUsers();
        const filtered = this.userSvc.filterDuplicateGuests(allUsers, this.currentUserId || null);
        const mapped = filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' }));
        MessageInputPopupHelper.allUsersCache = mapped;
        this.allPopupUsers = mapped;
      }
      this.popupUsers = [...this.allPopupUsers];
    } catch (e) {
      console.error('Fehler beim Laden der Popup-User:', e);
      this.allPopupUsers = [];
      this.popupUsers = [];
    } finally {
      this.isLoading = false;
    }
  }

  async loadChannels(): Promise<void> {
    const cachedChannels = this.channelSvc.channels();
    if (cachedChannels.length > 0) {
      this.allPopupChannels = cachedChannels.filter((c) => !!c.id).map((c) => ({ id: c.id!, name: c.name }));
      this.popupChannels = [...this.allPopupChannels];
      return;
    }
    this.isLoading = true;
    try {
      const fetched = await this.channelSvc.getChannels();
      this.allPopupChannels = fetched.filter((c) => !!c.id).map((c) => ({ id: c.id!, name: c.name }));
      this.popupChannels = [...this.allPopupChannels];
    } catch (e) {
      console.error('Fehler beim Laden der Popup-Channels:', e);
      this.allPopupChannels = [];
      this.popupChannels = [];
    } finally {
      this.isLoading = false;
    }
  }

  checkForTriggerChar(): void {
    const textarea = this.getTextarea();
    if (!textarea) return;
    const text = this.getMessageText();
    const selectionEnd = textarea.selectionEnd;
    if (selectionEnd <= 0) { this.closePopup(); return; }
    const textBeforeCursor = text.substring(0, selectionEnd);
    const lastSpace = textBeforeCursor.lastIndexOf(' ');
    const currentWord = textBeforeCursor.substring(lastSpace + 1);
    if (currentWord === '@') { this.activePopup = 'users'; void this.loadUsers(); }
    else if (currentWord === '#') { this.activePopup = 'channels'; void this.loadChannels(); }
    else if (this.activePopup !== 'none') this.updatePopupVisibility(text, selectionEnd);
  }

  updatePopupVisibility(text: string, selectionEnd: number): void {
    if (this.activePopup === 'none') return;
    const textBeforeCursor = text.substring(0, selectionEnd);
    const lastSpace = textBeforeCursor.lastIndexOf(' ');
    const currentWord = textBeforeCursor.substring(lastSpace + 1);
    if (this.activePopup === 'users' && currentWord.startsWith('@')) {
      this.filterPopupUsers(currentWord.substring(1));
    } else if (this.activePopup === 'channels' && currentWord.startsWith('#')) {
      this.filterPopupChannels(currentWord.substring(1));
    } else {
      this.closePopup();
    }
  }

  filterPopupUsers(query: string): void {
    const q = query.toLowerCase();
    this.popupUsers = this.allPopupUsers.filter((u) => u.name.toLowerCase().includes(q));
  }

  filterPopupChannels(query: string): void {
    const q = query.toLowerCase();
    this.popupChannels = this.allPopupChannels.filter((c) => c.name.toLowerCase().includes(q));
  }

  insertUserMention(user: PopupUser): void {
    const zeroWidthId = this.messageSvc.encodeToZeroWidth(user.id);
    this.insertMention(`@${user.name}\u200B${zeroWidthId}`);
  }

  insertMention(mentionText: string): void {
    const textarea = this.getTextarea();
    const text = this.getMessageText();
    if (textarea) {
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      const textBefore = text.substring(0, text.substring(0, startPos).lastIndexOf(' ') + 1);
      const textAfter = text.substring(endPos);
      this.setMessageText(textBefore + mentionText + ' ' + textAfter);
      setTimeout(() => {
        textarea.focus();
        const newPos = textBefore.length + mentionText.length + 1;
        textarea.setSelectionRange(newPos, newPos);
        this.syncScroll();
      }, 0);
    } else {
      this.setMessageText(text ? `${text} ${mentionText} ` : `${mentionText} `);
    }
    this.closePopup();
  }

  closePopup(): void {
    this.activePopup = 'none';
  }
}
