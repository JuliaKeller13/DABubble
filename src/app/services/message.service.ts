import { Injectable, inject, EventEmitter } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';
import { User } from '../interfaces/user.interface';
import { Channel } from '../interfaces/channel.interface';
import { MessageEncodingService } from './message-encoding.service';
import { MessageSubscriptionService } from './message-subscription.service';
import { DirectMessageService } from './direct-message.service';

@Injectable({
  providedIn: 'root',
})
export class messageService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);
  private encodingSvc = inject(MessageEncodingService);
  private subscriptionSvc = inject(MessageSubscriptionService);
  private dmSvc = inject(DirectMessageService);

  public messageDeleted = new EventEmitter<string>();
  public directChatCleared = new EventEmitter<{ currentUserId: string; targetUserId: string }>();
  public optimisticReaction = new EventEmitter<{ messageId: string; emoji: string; userId: string }>();
  public searchTargetMessageId: string | null = null;
  public searchTargetSelected = new EventEmitter<string>();

  // ── Channel messages ───────────────────────────────────────────────────────

  async getChannelMessages(channelId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });
      if (error) { console.error('Error fetching messages:', error.message); return []; }
      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      return (messages as Message[]).map((msg) => ({ ...msg, sender: userMap.get(msg.sender_id) }));
    } catch (err) {
      console.error('Failed to get channel messages:', err);
      return [];
    }
  }

  async sendMessage(
    content: string,
    senderId: string,
    channelId: string,
    parentMessageId?: string,
  ): Promise<Message | null> {
    try {
      const parsedContent = this.zeroWidthToMarkup(content);
      const payload: any = { content: parsedContent, sender_id: senderId, channel_id: channelId };
      if (parentMessageId) payload.parent_id = parentMessageId;
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages').insert(payload).select().single();
      if (error) { console.error('Error sending message:', error.message); throw error; }
      const sender = await this.userSvc.getUserById(senderId);
      const newMessage = data as Message;
      if (!newMessage.created_at) newMessage.created_at = new Date().toISOString();
      if (sender) newMessage.sender = sender;
      return newMessage;
    } catch (err) {
      console.error('Failed to send message:', err);
      return null;
    }
  }

  async deleteMessage(msgId: string): Promise<void> {
    this.messageDeleted.emit(msgId);
    try {
      await this.supabaseSvc.supabase.from('messages').delete().eq('id', msgId);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  }

  async toggleReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages').select('reactions').eq('id', messageId).single();
      if (error) { console.error('Error fetching reaction for toggle:', error.message); return; }
      const reactions = (data?.reactions as Record<string, string[]>) || {};
      let userIds = reactions[emoji] || [];
      userIds = userIds.includes(userId) ? userIds.filter((id) => id !== userId) : [...userIds, userId];
      if (userIds.length === 0) delete reactions[emoji]; else reactions[emoji] = userIds;
      const { error: updateError } = await this.supabaseSvc.supabase
        .from('messages').update({ reactions }).eq('id', messageId);
      if (updateError) console.error('Error updating reaction:', updateError.message);
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }

  async getThreadReplies(parentMessageId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages').select('*').eq('parent_id', parentMessageId)
        .order('created_at', { ascending: true });
      if (error) { console.error('Error fetching replies:', error.message); return []; }
      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      return (messages as Message[]).map((msg) => ({ ...msg, sender: userMap.get(msg.sender_id) }));
    } catch (err) {
      console.error('Failed to get thread replies:', err);
      return [];
    }
  }

  async getChannelMentions(userId: string): Promise<Message[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages').select('id, channel_id, created_at, content')
        .not('channel_id', 'is', null).like('content', `%<@${userId}>%`);
      if (error) { console.error('Error fetching channel mentions:', error.message); return []; }
      return data as Message[];
    } catch (err) {
      console.error('Failed to get channel mentions:', err);
      return [];
    }
  }

  // ── Delegatoren: Direct Messages ──────────────────────────────────────────

  getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    return this.dmSvc.getDirectMessages(currentUserId, targetUserId);
  }

  sendDirectMessage(content: string, senderId: string, recipientId: string): Promise<Message | null> {
    return this.dmSvc.sendDirectMessage(content, senderId, recipientId);
  }

  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    const success = await this.dmSvc.deleteDirectChatHistory(currentUserId, targetUserId);
    if (success) this.directChatCleared.emit({ currentUserId, targetUserId });
    return success;
  }

  getDirectChatDeletions(currentUserId: string): Promise<Record<string, string>> {
    return this.dmSvc.getDirectChatDeletions(currentUserId);
  }

  getActiveDMPartners(currentUserId: string): Promise<string[]> {
    return this.dmSvc.getActiveDMPartners(currentUserId);
  }

  getAllUserDirectMessages(currentUserId: string): Promise<Message[]> {
    return this.dmSvc.getAllUserDirectMessages(currentUserId);
  }

  // ── Delegatoren: Subscriptions ────────────────────────────────────────────

  subscribeToChannelMessages(
    channelId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToChannelMessages(channelId, callback, broadcastCallback);
  }

  subscribeToDirectMessages(
    currentUserId: string,
    targetUserId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToDirectMessages(currentUserId, targetUserId, callback, broadcastCallback);
  }

  subscribeToThreadReplies(
    parentMessageId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToThreadReplies(parentMessageId, callback, broadcastCallback);
  }

  subscribeToAllUserDirectMessages(
    currentUserId: string,
    callback: (message: Message) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToAllUserDirectMessages(currentUserId, callback);
  }

  subscribeToAllChannelMentions(currentUserId: string, callback: () => void): RealtimeChannel {
    return this.subscriptionSvc.subscribeToAllChannelMentions(currentUserId, callback);
  }

  unsubscribe(channel: RealtimeChannel): Promise<void> {
    return this.subscriptionSvc.unsubscribe(channel);
  }

  sendTypingStatus(channel: RealtimeChannel | null, userId: string, userName: string, isTyping: boolean): void {
    this.subscriptionSvc.sendTypingStatus(channel, userId, userName, isTyping);
  }

  // ── Delegatoren: Encoding ─────────────────────────────────────────────────

  zeroWidthToMarkup(text: string): string {
    return this.encodingSvc.zeroWidthToMarkup(text);
  }

  markupToZeroWidth(text: string, users: User[], channels: Channel[]): string {
    return this.encodingSvc.markupToZeroWidth(text, users, channels);
  }

  encodeToZeroWidth(str: string): string {
    return this.encodingSvc.encodeToZeroWidth(str);
  }

  decodeFromZeroWidth(zeroWidthStr: string): string {
    return this.encodingSvc.decodeFromZeroWidth(zeroWidthStr);
  }
}
