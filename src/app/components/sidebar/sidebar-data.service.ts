import { Injectable, inject } from '@angular/core';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { messageService } from '../../services/message.service';
import { User } from '../../interfaces/user.interface';
import { Message } from '../../interfaces/message.interface';
import { Channel } from '../../interfaces/channel.interface';

export interface SidebarData {
  channels: Channel[];
  users: User[];
  usersWithHistory: User[];
  usersWithoutHistory: User[];
  unreadUsers: Record<string, number>;
  unreadChannels: Record<string, number>;
}

@Injectable({
  providedIn: 'root',
})
export class SidebarDataService {
  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private authSvc = inject(authService);
  private messageSvc = inject(messageService);

  private readonly TEAM_USER: User = {
    id: 'dabubble-team-local-id', display_name: 'DABubble-Team',
    email: 'team@dabubble.local', avatar_url: 'img/logo/Logo.svg', status: 'online',
  };

  getSafeLocalStorageItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) return localStorage.getItem(key);
    return null;
  }

  setSafeLocalStorageItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) localStorage.setItem(key, value);
  }

  isUserMentionedInText(content: string, currentUserId: string): boolean {
    return !!content && content.includes(`<@${currentUserId}>`);
  }

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
