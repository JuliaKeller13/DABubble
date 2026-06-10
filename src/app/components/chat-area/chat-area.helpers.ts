import { WritableSignal } from '@angular/core';
import { Message } from '../../interfaces/message.interface';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';

/**
 * Interface representing a group of messages under a specific date label.
 */
export interface DateGroup {
  /** The date label, e.g. "Heute", "Gestern", or formatted date string. */
  dateLabel: string;
  /** List of messages belonging to this date group. */
  messages: Message[];
}

/**
 * Builds a list of DateGroup objects from the flat array of messages.
 * Only root messages (without parent_id) are grouped, and each message is enriched with reply details.
 * @param messages - The flat array of messages.
 * @returns Array of grouped messages.
 */
export function buildGroupedMessages(messages: Message[]): DateGroup[] {
  const groups: DateGroup[] = [];
  const rootMessages = messages
    .filter((msg) => !msg.parent_id)
    .map((msg) => enrichMessage(msg, messages));
  rootMessages.forEach((msg) => addMessageToGroup(msg, groups));
  return groups;
}

/**
 * Enriches a message with reply count and last reply timestamp.
 * @param msg - The message to enrich.
 * @param messages - The full list of messages to find replies from.
 * @returns The enriched message.
 */
function enrichMessage(msg: Message, messages: Message[]): Message {
  const replies = messages.filter((m) => m.parent_id === msg.id);
  return {
    ...msg,
    reply_count: replies.length,
    last_reply_time: replies.length > 0 ? replies[replies.length - 1].created_at : undefined,
  } as Message;
}

/**
 * Adds a message to the corresponding date group in the provided list.
 * @param msg - The message to add.
 * @param groups - The array of DateGroup objects.
 */
function addMessageToGroup(msg: Message, groups: DateGroup[]): void {
  const label = getDateLabel(msg.created_at);
  let group = groups.find((g) => g.dateLabel === label);
  if (!group) {
    group = { dateLabel: label, messages: [] };
    groups.push(group);
  }
  group.messages.push(msg);
}

/**
 * Formats a given ISO date string into a friendly label like "Heute", "Gestern", or "weekday, day month".
 * @param dateStr - The ISO date string.
 * @returns The formatted date label.
 */
export function getDateLabel(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Heute';
  if (date.toDateString() === yesterday.toDateString()) return 'Gestern';
  return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).replace('.', '');
}

/**
 * Scrolls the given HTML container element to the bottom.
 * @param scrollContainer - The scroll container ElementRef.
 */
export function scrollContainerToBottom(scrollContainer: any): void {
  setTimeout(() => {
    if (scrollContainer) scrollContainer.nativeElement.scrollTop = scrollContainer.nativeElement.scrollHeight;
  }, 100);
}

/**
 * Checks if there is a search target message active, and if so, scrolls to it.
 * Otherwise, scrolls the container to the bottom.
 * @param searchTargetMessageId - The ID of the targeted search message.
 * @param clearTarget - Callback function to clear the search target.
 * @param scrollContainer - The scroll container element.
 */
export function checkAndScrollToSearchTarget(
  searchTargetMessageId: string | null,
  clearTarget: () => void,
  scrollContainer: any,
): void {
  const targetId = searchTargetMessageId;
  if (targetId) {
    setTimeout(() => {
      const element = document.getElementById('message-' + targetId);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else scrollContainerToBottom(scrollContainer);
      setTimeout(() => clearTarget(), 3000);
    }, 300);
  } else {
    scrollContainerToBottom(scrollContainer);
  }
}

/**
 * Handles typing broadcast events, updating lists of typing users and scheduling automatic removal timeouts.
 * @param payload - The typing status payload.
 * @param currentUserId - The current user's ID.
 * @param typingUsers - WritableSignal of users currently typing.
 * @param typingTimeouts - Map containing removal timeouts by user ID.
 */
export function handleTypingBroadcast(
  payload: { userId: string; userName: string; isTyping: boolean },
  currentUserId: string,
  typingUsers: WritableSignal<{ userId: string; userName: string }[]>,
  typingTimeouts: Map<string, any>,
): void {
  if (payload.userId === currentUserId) return;
  const existing = typingTimeouts.get(payload.userId);
  if (existing) { clearTimeout(existing); typingTimeouts.delete(payload.userId); }
  if (payload.isTyping) {
    typingUsers.update((users) => users.some((u) => u.userId === payload.userId) ? users : [...users, { userId: payload.userId, userName: payload.userName }]);
    const timeout = setTimeout(() => {
      typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
      typingTimeouts.delete(payload.userId);
    }, 5000);
    typingTimeouts.set(payload.userId, timeout);
  } else {
    typingUsers.update((users) => users.filter((u) => u.userId !== payload.userId));
  }
}

/**
 * Gets a descriptive display text summarizing who is currently typing.
 * @param typingUsers - Array of users currently typing.
 * @returns Formatted typing text.
 */
export function getTypingText(typingUsers: { userId: string; userName: string }[]): string {
  if (typingUsers.length === 0) return '';
  if (typingUsers.length === 1) return `${typingUsers[0].userName} schreibt...`;
  if (typingUsers.length === 2) return `${typingUsers[0].userName} und ${typingUsers[1].userName} schreiben...`;
  return 'Mehrere Personen schreiben...';
}

/**
 * Searches for users and channels matching the query string.
 * Supports prefixes like '#' for channels and '@' for users.
 * @param query - The search query.
 * @param channelSvc - The channel service instance.
 * @param userSvc - The user service instance.
 * @param currentUserId - The current user's ID.
 * @returns A promise resolving to filtered channels and users.
 */
export async function searchRecipients(
  query: string,
  channelSvc: channelService,
  userSvc: userService,
  currentUserId: string,
): Promise<{ filteredChannels: Channel[]; filteredUsers: User[] }> {
  if (!query) return { filteredChannels: [], filteredUsers: [] };
  const allC = channelSvc.channels();
  const allU = await userSvc.getAllUsers();
  const filteredAllUsers = userSvc.filterDuplicateGuests(allU, currentUserId);
  if (query.startsWith('#')) {
    const search = query.substring(1).toLowerCase();
    return { filteredChannels: allC.filter((c) => c.name.toLowerCase().includes(search)), filteredUsers: [] };
  }
  if (query.startsWith('@')) {
    const search = query.substring(1).toLowerCase();
    return { filteredChannels: [], filteredUsers: filteredAllUsers.filter((u) => u.display_name.toLowerCase().includes(search)) };
  }
  const search = query.toLowerCase();
  return {
    filteredChannels: allC.filter((c) => c.name.toLowerCase().includes(search)),
    filteredUsers: filteredAllUsers.filter((u) => u.display_name.toLowerCase().includes(search) || (u.email && u.email.toLowerCase().includes(search))),
  };
}

/**
 * Adds selected members to a channel.
 * @param memberResult - The object representing member selection.
 * @param channelId - The ID of the target channel.
 * @param userSvc - The user service instance.
 * @param channelSvc - The channel service instance.
 * @param currentUserId - The current user's ID.
 * @returns A promise that resolves when the members are added.
 */
export async function addMembersToChannel(
  memberResult: any,
  channelId: string,
  userSvc: userService,
  channelSvc: channelService,
  currentUserId: string,
): Promise<void> {
  let memberIds: string[] = [];
  if (memberResult.selectionType === 'all') {
    const allUsers = await userSvc.getAllUsers();
    memberIds = userSvc.filterDuplicateGuests(allUsers, currentUserId).map((u) => u.id);
  } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
    memberIds = memberResult.selectedUsers;
  }
  if (memberIds.length > 0) {
    await channelSvc.addMembersToChannel(channelId, memberIds);
    await channelSvc.refreshActiveChannelMembers();
  }
}

/**
 * Sends a message in new message mode and navigates to the target channel or direct chat.
 * @param content - The message content.
 * @param selectedRecipient - The selected recipient user or channel object.
 * @param selectedRecipientType - Recipient type ('channel' or 'user').
 * @param userId - The sender's ID.
 * @param messageSvc - The message service instance.
 * @param router - The Angular router instance.
 * @returns A promise resolving to true if successful, false otherwise.
 */
export async function sendNewModeMessage(
  content: string,
  selectedRecipient: any,
  selectedRecipientType: 'channel' | 'user' | null,
  userId: string,
  messageSvc: any,
  router: any,
): Promise<boolean> {
  if (!selectedRecipient || !userId) return false;
  if (selectedRecipientType === 'channel') {
    const newMsg = await messageSvc.sendMessage(content, userId, selectedRecipient.id);
    if (newMsg) { router.navigate(['/main/channel', selectedRecipient.id]); return true; }
  } else if (selectedRecipientType === 'user') {
    const newMsg = await messageSvc.sendDirectMessage(content, userId, selectedRecipient.id);
    if (newMsg) { router.navigate(['/main/dm', selectedRecipient.id]); return true; }
  }
  return false;
}
