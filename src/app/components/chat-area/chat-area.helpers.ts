import { WritableSignal } from '@angular/core';
import { Message } from '../../interfaces/message.interface';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';

export interface DateGroup {
  dateLabel: string;
  messages: Message[];
}

export function buildGroupedMessages(messages: Message[]): DateGroup[] {
  const groups: DateGroup[] = [];
  const rootMessages = messages
    .filter((msg) => !msg.parent_id)
    .map((msg) => {
      const replies = messages.filter((m) => m.parent_id === msg.id);
      return {
        ...msg,
        reply_count: replies.length,
        last_reply_time: replies.length > 0 ? replies[replies.length - 1].created_at : undefined,
      } as Message;
    });
  rootMessages.forEach((msg) => {
    const label = getDateLabel(msg.created_at);
    let group = groups.find((g) => g.dateLabel === label);
    if (!group) { group = { dateLabel: label, messages: [] }; groups.push(group); }
    group.messages.push(msg);
  });
  return groups;
}

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

export function scrollContainerToBottom(scrollContainer: any): void {
  setTimeout(() => {
    if (scrollContainer) scrollContainer.nativeElement.scrollTop = scrollContainer.nativeElement.scrollHeight;
  }, 100);
}

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

export function getTypingText(typingUsers: { userId: string; userName: string }[]): string {
  if (typingUsers.length === 0) return '';
  if (typingUsers.length === 1) return `${typingUsers[0].userName} schreibt...`;
  if (typingUsers.length === 2) return `${typingUsers[0].userName} und ${typingUsers[1].userName} schreiben...`;
  return 'Mehrere Personen schreiben...';
}

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
