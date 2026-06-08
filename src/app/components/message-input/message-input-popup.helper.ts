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
    const channelId = (this.threadSvc.activeMessage()?.channel_id) || (this.channelSvc.activeChannel()?.id) || '';
    if (this.loadUsersFromCache(channelId)) return;
    await this.fetchUsersFromDb(channelId);
  }

  private loadUsersFromCache(channelId: string): boolean {
    const activeMembers = this.channelSvc.activeChannelMembers();
    if (channelId && channelId === this.channelSvc.activeChannel()?.id && activeMembers.length > 0) {
      this.allPopupUsers = this.mapUsers(activeMembers);
      MessageInputPopupHelper.channelMembersCache.set(channelId, this.allPopupUsers);
    } else if (channelId && MessageInputPopupHelper.channelMembersCache.has(channelId)) {
      this.allPopupUsers = MessageInputPopupHelper.channelMembersCache.get(channelId)!;
    } else if (!channelId && MessageInputPopupHelper.allUsersCache.length > 0) {
      this.allPopupUsers = MessageInputPopupHelper.allUsersCache;
    } else return false;
    this.popupUsers = [...this.allPopupUsers];
    return true;
  }

  private mapUsers(users: any[]): PopupUser[] {
    const filtered = this.userSvc.filterDuplicateGuests(users, this.currentUserId || null);
    return filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' }));
  }

  private async fetchUsersFromDb(channelId: string): Promise<void> {
    this.isLoading = true;
    try {
      this.allPopupUsers = await this.queryUsers(channelId);
      this.popupUsers = [...this.allPopupUsers];
    } catch (e) {
      console.error('Fehler beim Laden der Popup-User:', e);
      this.allPopupUsers = this.popupUsers = [];
    } finally {
      this.isLoading = false;
    }
  }

  private async queryUsers(channelId: string): Promise<PopupUser[]> {
    if (channelId) {
      const dbMembers = await this.channelSvc.getChannelMembers(channelId);
      const mapped = this.mapUsers(dbMembers);
      MessageInputPopupHelper.channelMembersCache.set(channelId, mapped);
      return mapped;
    }
    const allUsers = await this.userSvc.getAllUsers();
    const mappedAll = this.mapUsers(allUsers);
    MessageInputPopupHelper.allUsersCache = mappedAll;
    return mappedAll;
  }

  async loadChannels(): Promise<void> {
    const cached = this.channelSvc.channels();
    if (cached.length > 0) {
      this.allPopupChannels = this.popupChannels = this.mapChannels(cached);
    } else {
      await this.fetchChannelsFromDb();
    }
  }

  private async fetchChannelsFromDb(): Promise<void> {
    this.isLoading = true;
    try {
      const fetched = await this.channelSvc.getChannels();
      this.allPopupChannels = this.popupChannels = this.mapChannels(fetched);
    } catch (e) {
      console.error('Fehler beim Laden der Popup-Channels:', e);
      this.allPopupChannels = this.popupChannels = [];
    } finally {
      this.isLoading = false;
    }
  }

  private mapChannels(chans: any[]): PopupChannel[] {
    return chans.filter((c) => !!c.id).map((c) => ({ id: c.id!, name: c.name }));
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
      this.insertAtCursor(textarea, text, mentionText);
    } else {
      this.setMessageText(text ? `${text} ${mentionText} ` : `${mentionText} `);
    }
    this.closePopup();
  }

  private insertAtCursor(textarea: HTMLTextAreaElement, text: string, mentionText: string): void {
    const startPos = textarea.selectionStart;
    const textBefore = text.substring(0, text.substring(0, startPos).lastIndexOf(' ') + 1);
    const textAfter = text.substring(textarea.selectionEnd);
    this.setMessageText(textBefore + mentionText + ' ' + textAfter);
    setTimeout(() => {
      textarea.focus();
      const newPos = textBefore.length + mentionText.length + 1;
      textarea.setSelectionRange(newPos, newPos);
      this.syncScroll();
    }, 0);
  }

  closePopup(): void {
    this.activePopup = 'none';
  }
}
