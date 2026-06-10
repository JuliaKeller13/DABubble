import { WritableSignal } from '@angular/core';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';
import { messageService } from '../../services/message.service';

/**
 * Type of the active autocomplete popup in the message input field.
 */
export type PopupType = 'none' | 'users' | 'channels';

/**
 * Represents a user profile displayed in the mention autocomplete list.
 */
export interface PopupUser {
  /** The unique user ID. */
  id: string;
  /** The display name of the user. */
  name: string;
  /** The URL path to the user's avatar. */
  avatar: string;
}

/**
 * Represents a channel displayed in the channel link autocomplete list.
 */
export interface PopupChannel {
  /** The unique channel ID. */
  id: string;
  /** The channel name. */
  name: string;
}

/**
 * Helper class that coordinates matching and autocomplete dropdown popups
 * for user and channel mentions within the message input textarea.
 */
export class MessageInputPopupHelper {
  /** The currently active autocomplete popup type. */
  activePopup: PopupType = 'none';
  /** The list of users currently visible in the autocomplete popup. */
  popupUsers: PopupUser[] = [];
  /** The list of channels currently visible in the autocomplete popup. */
  popupChannels: PopupChannel[] = [];
  /** Whether the helper is currently querying database information. */
  isLoading = false;

  /** Unfiltered list of loaded user options for autocomplete. */
  private allPopupUsers: PopupUser[] = [];
  /** Unfiltered list of loaded channel options for autocomplete. */
  private allPopupChannels: PopupChannel[] = [];

  /** Cache storing channel members by channel ID to reduce query frequency. */
  private static channelMembersCache = new Map<string, PopupUser[]>();
  /** Cache storing all user profiles. */
  static allUsersCache: PopupUser[] = [];

  /**
   * Initializes the MessageInputPopupHelper.
   * @param channelSvc - The injected ChannelService.
   * @param userSvc - The injected UserService.
   * @param authSvc - The injected AuthService.
   * @param threadSvc - The injected ThreadService.
   * @param messageSvc - The injected MessageService.
   * @param getTextarea - Function returning the HTMLTextAreaElement of the input.
   * @param getMessageText - Function returning the raw string content of the input.
   * @param setMessageText - Function to set the content of the input.
   * @param syncScroll - Function to trigger scroll alignment.
   */
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

  /**
   * Gets the current user ID.
   */
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  /**
   * Checks if mention/autocomplete is active.
   */
  get isMentionActive(): boolean {
    return this.activePopup !== 'none';
  }

  /**
   * Toggles mention states between users popup, channels popup, and none.
   */
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

  /**
   * Loads users for the autocomplete list, utilizing caches when possible.
   */
  async loadUsers(): Promise<void> {
    const channelId = (this.threadSvc.activeMessage()?.channel_id) || (this.channelSvc.activeChannel()?.id) || '';
    if (this.loadUsersFromCache(channelId)) return;
    await this.fetchUsersFromDb(channelId);
  }

  /**
   * Attempts to load user data from cached objects.
   * @param channelId - Target channel ID.
   * @returns True if loaded from cache successfully, false otherwise.
   */
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

  /**
   * Maps generic user objects to structured PopupUser objects, filtering duplicate guests.
   * @param users - Unstructured list of users.
   */
  private mapUsers(users: any[]): PopupUser[] {
    const filtered = this.userSvc.filterDuplicateGuests(users, this.currentUserId || null);
    return filtered.map((u) => ({ id: u.id, name: u.display_name, avatar: u.avatar_url || 'img/avatars/avatar_default.svg' }));
  }

  /**
   * Fetches users from the database for the popup list.
   * @param channelId - Target channel ID.
   */
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

  /**
   * Internally runs queries to fetch users list based on channel availability.
   * @param channelId - Target channel ID.
   */
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

  /**
   * Loads channels for the link autocomplete list, using caches when possible.
   */
  async loadChannels(): Promise<void> {
    const cached = this.channelSvc.channels();
    if (cached.length > 0) {
      this.allPopupChannels = this.popupChannels = this.mapChannels(cached);
    } else {
      await this.fetchChannelsFromDb();
    }
  }

  /**
   * Fetches channels from database.
   */
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

  /**
   * Maps channel database rows to PopupChannel structures.
   * @param chans - Unstructured channels.
   */
  private mapChannels(chans: any[]): PopupChannel[] {
    return chans.filter((c) => !!c.id).map((c) => ({ id: c.id!, name: c.name }));
  }

  /**
   * Scans text content around the cursor, looking for trigger characters ('@', '#')
   * to automatically open the respective autocomplete popup.
   */
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

  /**
   * Filters lists or closes the popup depending on current input changes.
   * @param text - The full input text.
   * @param selectionEnd - Cursor position.
   */
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

  /**
   * Filters the visible autocomplete users list.
   * @param query - The user search query.
   */
  filterPopupUsers(query: string): void {
    const q = query.toLowerCase();
    this.popupUsers = this.allPopupUsers.filter((u) => u.name.toLowerCase().includes(q));
  }

  /**
   * Filters the visible autocomplete channels list.
   * @param query - The channel search query.
   */
  filterPopupChannels(query: string): void {
    const q = query.toLowerCase();
    this.popupChannels = this.allPopupChannels.filter((c) => c.name.toLowerCase().includes(q));
  }

  /**
   * Encodes a user ID into zero-width characters and inserts the user mention text block.
   * @param user - Selected user.
   */
  insertUserMention(user: PopupUser): void {
    const zeroWidthId = this.messageSvc.encodeToZeroWidth(user.id);
    this.insertMention(`@${user.name}\u200B${zeroWidthId}`);
  }

  /**
   * Appends or inserts a mention string block at the text cursor.
   * @param mentionText - Formatted mention string block.
   */
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

  /**
   * Internal routine performing precise text insertion at textarea cursor position.
   * @param textarea - Textarea HTML element.
   * @param text - Complete input text.
   * @param mentionText - Formatted mention block.
   */
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

  /**
   * Closes active autocomplete popups.
   */
  closePopup(): void {
    this.activePopup = 'none';
  }
}
