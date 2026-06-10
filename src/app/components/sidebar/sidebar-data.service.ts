import { Injectable, inject } from '@angular/core';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { messageService } from '../../services/message.service';
import { User } from '../../interfaces/user.interface';
import { Message } from '../../interfaces/message.interface';
import { Channel } from '../../interfaces/channel.interface';

/**
 * Data structure containing loaded channels, users, history breakdowns, and unread counts for the sidebar.
 */
export interface SidebarData {
  /**
   * List of loaded channels.
   */
  channels: Channel[];

  /**
   * List of all active/loaded user profiles.
   */
  users: User[];

  /**
   * List of users with whom the current user has active direct message history.
   */
  usersWithHistory: User[];

  /**
   * List of users with whom the current user does not have active direct message history.
   */
  usersWithoutHistory: User[];

  /**
   * Map of user IDs to number of unread direct messages.
   */
  unreadUsers: Record<string, number>;

  /**
   * Map of channel IDs to number of unread mention notifications.
   */
  unreadChannels: Record<string, number>;
}

@Injectable({
  providedIn: 'root',
})
/**
 * Service that fetches and computes sidebar datasets, sorting users and calculating unread notifications for direct chats and channel mentions.
 */
export class SidebarDataService {
  /**
   * Service managing channels data loading.
   */
  private channelSvc = inject(channelService);

  /**
   * Service managing user profile retrieval.
   */
  private userSvc = inject(userService);

  /**
   * Service managing user authentication session and state.
   */
  private authSvc = inject(authService);

  /**
   * Service for direct messaging and channel messages actions.
   */
  private messageSvc = inject(messageService);

  /**
   * Static representation of the DABubble Team placeholder user profile.
   */
  private readonly TEAM_USER: User = {
    id: 'dabubble-team-local-id', display_name: 'DABubble-Team',
    email: 'team@dabubble.local', avatar_url: 'img/logo/Logo.svg', status: 'online',
  };

  /**
   * Safely retrieves a value from localStorage, checking if the window object is defined.
   * 
   * @param key The key to look up in localStorage.
   * @returns The string value if found, or null.
   */
  getSafeLocalStorageItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) return localStorage.getItem(key);
    return null;
  }

  /**
   * Safely writes a key-value pair to localStorage, checking if the window object is defined.
   * 
   * @param key The storage key.
   * @param value The string value to store.
   */
  setSafeLocalStorageItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) localStorage.setItem(key, value);
  }

  /**
   * Checks if the current user's ID tag is mentioned in a text message.
   * 
   * @param content The text content of the message.
   * @param currentUserId The user ID to search for.
   * @returns True if mentioned, false otherwise.
   */
  isUserMentionedInText(content: string, currentUserId: string): boolean {
    return !!content && content.includes(`<@${currentUserId}>`);
  }

  /**
   * Asynchronously loads channels, users, compute unread counts, and splits direct message history for the sidebar.
   * 
   * @param sessionStartTime Timestamp when the current session started.
   * @param activeChannelId Currently active channel ID, if any.
   * @param activeDMUserId Currently active direct message partner user ID, if any.
   * @returns A promise resolving to the computed SidebarData.
   */
  async load(
    sessionStartTime: number,
    activeChannelId: string | undefined,
    activeDMUserId: string | undefined,
  ): Promise<SidebarData> {
    const currentUserId = this.authSvc.currentUser()?.id || '';
    const fetchedChannels = await this.channelSvc.loadChannels();
    const allFetchedUsers = await this.userSvc.getAllUsers();
    const unreadChannels = await this.computeUnreadChannels(currentUserId, activeChannelId, sessionStartTime);
    const { partnerIdsSet, unreadUsers, isGuest } = await this.computeDMData(currentUserId, activeDMUserId, sessionStartTime);
    const fetchedUsers = this.userSvc.filterDuplicateGuests(allFetchedUsers, currentUserId, Array.from(partnerIdsSet));
    const { usersWithHistory, usersWithoutHistory } = this.splitUsers(fetchedUsers, partnerIdsSet, currentUserId, isGuest);
    return { channels: fetchedChannels, users: fetchedUsers, usersWithHistory, usersWithoutHistory, unreadUsers, unreadChannels };
  }

  /**
   * Calculates unread channel mentions counts.
   * 
   * @param currentUserId ID of the current user.
   * @param activeChannelId Currently open channel ID.
   * @param sessionStartTime Current session start time fallback.
   * @returns A map of channel IDs to mention count.
   */
  private async computeUnreadChannels(
    currentUserId: string, activeChannelId: string | undefined, sessionStartTime: number,
  ): Promise<Record<string, number>> {
    if (!currentUserId) return {};
    const mentions = await this.messageSvc.getChannelMentions(currentUserId);
    const unreadChanMap: Record<string, number> = {};
    mentions.forEach((msg) => {
      const chanId = msg.channel_id;
      if (!chanId || chanId === activeChannelId) return;
      if (!this.isUserMentionedInText(msg.content || '', currentUserId)) return;
      const lastReadStr = this.getSafeLocalStorageItem(`channel_last_read:${currentUserId}:${chanId}`);
      const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : sessionStartTime;
      const msgTime = new Date(msg.created_at || '').getTime();
      if (msgTime > lastReadTime) unreadChanMap[chanId] = (unreadChanMap[chanId] || 0) + 1;
    });
    return unreadChanMap;
  }

  /**
   * Loads direct messages to compute unread counts and identify chat history users.
   * 
   * @param currentUserId ID of the current user.
   * @param activeDMUserId Currently open DM partner user ID.
   * @param sessionStartTime Current session start time fallback.
   * @returns Object containing active chat partner IDs, unread maps, and guest status.
   */
  private async computeDMData(
    currentUserId: string, activeDMUserId: string | undefined, sessionStartTime: number,
  ): Promise<{ partnerIdsSet: Set<string>; unreadUsers: Record<string, number>; isGuest: boolean }> {
    if (!currentUserId) {
      return { partnerIdsSet: new Set(), unreadUsers: {}, isGuest: false };
    }
    const isGuest = !!(this.authSvc.currentUser()?.is_anonymous || this.authSvc.currentUserProfile()?.display_name === 'Gast');
    const dbDeletions = await this.messageSvc.getDirectChatDeletions(currentUserId);
    const allDMs = await this.messageSvc.getAllUserDirectMessages(currentUserId);
    const { partnerIdsSet, unreadMap, latestMessageTimeMap } = this.processDMs(allDMs, currentUserId, activeDMUserId, sessionStartTime);
    if (isGuest && activeDMUserId !== 'dabubble-team-local-id') {
      const lastReadStr = this.getSafeLocalStorageItem(`chat_last_read:${currentUserId}:dabubble-team-local-id`);
      if (!lastReadStr) unreadMap['dabubble-team-local-id'] = 1;
    }
    this.filterClosedChats(latestMessageTimeMap, partnerIdsSet, currentUserId, dbDeletions);
    return { partnerIdsSet, unreadUsers: unreadMap, isGuest };
  }

  /**
   * Iterates through all direct messages to identify partners, track latest message timestamps, and compute unread counts.
   * 
   * @param allDMs Array of DM message objects.
   * @param currentUserId Current user ID.
   * @param activeDMUserId Active DM partner ID.
   * @param sessionStartTime Current session start time fallback.
   * @returns Object with partner IDs set, unread counts map, and latest message time map.
   */
  private processDMs(
    allDMs: Message[], currentUserId: string, activeDMUserId: string | undefined, sessionStartTime: number,
  ) {
    const partnerIdsSet = new Set<string>();
    const unreadMap: Record<string, number> = {};
    const latestMessageTimeMap = new Map<string, number>();
    allDMs.forEach((msg) => {
      const partnerId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
      if (!partnerId) return;
      const msgTime = new Date(msg.created_at || '').getTime();
      if (msgTime > (latestMessageTimeMap.get(partnerId) || 0)) latestMessageTimeMap.set(partnerId, msgTime);
      if (msg.recipient_id !== currentUserId || activeDMUserId === partnerId) return;
      const lastReadStr = this.getSafeLocalStorageItem(`chat_last_read:${currentUserId}:${partnerId}`);
      const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : sessionStartTime;
      if (msgTime > lastReadTime) unreadMap[partnerId] = (unreadMap[partnerId] || 0) + 1;
    });
    return { partnerIdsSet, unreadMap, latestMessageTimeMap };
  }

  /**
   * Filters out users from the history set if the chat was explicitly closed/deleted by the user.
   * 
   * @param latestMessageTimeMap Map of partner IDs to latest message timestamps.
   * @param partnerIdsSet Set to collect active partners.
   * @param currentUserId Current user ID.
   * @param dbDeletions Database log of closed/deleted chat timestamps.
   */
  private filterClosedChats(
    latestMessageTimeMap: Map<string, number>,
    partnerIdsSet: Set<string>,
    currentUserId: string,
    dbDeletions: Record<string, string>,
  ): void {
    latestMessageTimeMap.forEach((latestMsgTime, partnerId) => {
      if (partnerId === currentUserId) return;
      const localClosedStr = this.getSafeLocalStorageItem(`chat_closed:${currentUserId}:${partnerId}`);
      const localClosedTime = localClosedStr ? new Date(localClosedStr).getTime() : 0;
      const dbClosedTime = dbDeletions[partnerId] ? new Date(dbDeletions[partnerId]).getTime() : 0;
      const closedTime = Math.max(localClosedTime, dbClosedTime);
      if (latestMsgTime > closedTime) partnerIdsSet.add(partnerId);
    });
  }

  /**
   * Splits user list into those with active chat history and those without, inserting a team user placeholder for guests if applicable.
   * 
   * @param fetchedUsers Array of all loaded user profiles.
   * @param partnerIdsSet Set of user IDs with active chats.
   * @param currentUserId Current user ID.
   * @param isGuest Boolean indicating if current user is guest.
   * @returns Object containing split user arrays.
   */
  private splitUsers(
    fetchedUsers: User[], partnerIdsSet: Set<string>, currentUserId: string, isGuest: boolean,
  ): { usersWithHistory: User[]; usersWithoutHistory: User[] } {
    if (!currentUserId) return { usersWithHistory: [], usersWithoutHistory: fetchedUsers };
    const withHistory = fetchedUsers.filter((u) => partnerIdsSet.has(u.id));
    if (isGuest) {
      const closedStr = this.getSafeLocalStorageItem(`chat_closed:${currentUserId}:dabubble-team-local-id`);
      if (!closedStr && !withHistory.some((u) => u.id === 'dabubble-team-local-id')) {
        withHistory.unshift(this.TEAM_USER);
      }
    }
    return { usersWithHistory: withHistory, usersWithoutHistory: fetchedUsers.filter((u) => !partnerIdsSet.has(u.id)) };
  }
}
