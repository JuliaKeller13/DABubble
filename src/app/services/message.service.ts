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

/**
 * Service that handles sending, fetching, and deleting messages in channels, threads,
 * and direct messages. It also coordinates message formatting/encoding and subscription updates.
 */
@Injectable({
  providedIn: 'root',
})
export class messageService {
  /**
   * Supabase service instance injected for handling database operations.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * User service instance injected for loading user information.
   */
  private userSvc = inject(userService);

  /**
   * Service injected to handle zero-width character formatting and markup encoding.
   */
  private encodingSvc = inject(MessageEncodingService);

  /**
   * Service injected for establishing realtime WebSocket channel subscriptions.
   */
  private subscriptionSvc = inject(MessageSubscriptionService);

  /**
   * Service injected for managing direct messages (DMs).
   */
  private dmSvc = inject(DirectMessageService);

  /**
   * Event emitted when a message is deleted, carrying the deleted message ID.
   */
  public messageDeleted = new EventEmitter<string>();

  /**
   * Event emitted when direct chat history is cleared, containing sender and recipient IDs.
   */
  public directChatCleared = new EventEmitter<{ currentUserId: string; targetUserId: string }>();

  /**
   * Event emitted to immediately update reaction states in the UI optimistically.
   */
  public optimisticReaction = new EventEmitter<{ messageId: string; emoji: string; userId: string }>();

  /**
   * Holds the ID of a message targeted by a search action, if any.
   */
  public searchTargetMessageId: string | null = null;

  /**
   * Event emitted when a search target message has been selected.
   */
  public searchTargetSelected = new EventEmitter<string>();

  // ── Channel messages ───────────────────────────────────────────────────────

  /**
   * Retrieves all messages belonging to a specific channel.
   * Maps sender profiles to messages based on the sender's ID.
   * 
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to an array of Message objects.
   */
  async getChannelMessages(channelId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true });
      if (error) return console.error('Error fetching messages:', error.message), [];
      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      return (messages as Message[]).map((msg) => ({ ...msg, sender: userMap.get(msg.sender_id) }));
    } catch (err) {
      return console.error('Failed to get channel messages:', err), [];
    }
  }

  /**
   * Sends a message in a channel (optionally as a thread reply to a parent message).
   * 
   * @param content - The raw content of the message.
   * @param senderId - The ID of the user sending the message.
   * @param channelId - The ID of the target channel.
   * @param parentMessageId - Optional ID of the parent message (for threads).
   * @returns A promise that resolves to the sent Message object or null if sending failed.
   */
  async sendMessage(
    content: string,
    senderId: string,
    channelId: string,
    parentMessageId?: string,
  ): Promise<Message | null> {
    try {
      const parsedContent = this.zeroWidthToMarkup(content);
      const payload: any = { content: parsedContent, sender_id: senderId };
      if (channelId) payload.channel_id = channelId;
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

  /**
   * Deletes a message from the database and emits the message ID through the `messageDeleted` emitter.
   * 
   * @param msgId - The ID of the message to delete.
   * @returns A promise that resolves when the delete operation is completed.
   */
  async deleteMessage(msgId: string): Promise<void> {
    this.messageDeleted.emit(msgId);
    try {
      await this.supabaseSvc.supabase.from('messages').delete().eq('id', msgId);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  }

  /**
   * Toggles a reaction emoji on a message for a specific user.
   * Adds the user to the list of reactors for that emoji if not present, otherwise removes them.
   * 
   * @param messageId - The ID of the message.
   * @param emoji - The emoji character/string.
   * @param userId - The ID of the user reacting.
   * @returns A promise that resolves when the database update is completed.
   */
  async toggleReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabaseSvc.supabase.from('messages').select('reactions').eq('id', messageId).single();
      if (error) return console.error('Error fetching reaction for toggle:', error.message);
      const reactions = (data?.reactions as Record<string, string[]>) || {};
      const uIds = reactions[emoji] || [];
      reactions[emoji] = uIds.includes(userId) ? uIds.filter((id) => id !== userId) : [...uIds, userId];
      if (reactions[emoji].length === 0) delete reactions[emoji];
      const { error: ue } = await this.supabaseSvc.supabase.from('messages').update({ reactions }).eq('id', messageId);
      if (ue) console.error('Error updating reaction:', ue.message);
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }

  /**
   * Retrieves all reply messages for a given parent message thread.
   * 
   * @param parentMessageId - The ID of the parent message.
   * @returns A promise that resolves to an array of thread reply Messages.
   */
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

  /**
   * Retrieves channel messages where the given user has been mentioned.
   * 
   * @param userId - The ID of the user being searched for mentions.
   * @returns A promise that resolves to an array of Messages.
   */
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

  /**
   * Retrieves direct messages between the current user and a target user.
   * Delegates to `DirectMessageService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the conversation partner.
   * @returns A promise that resolves to an array of DM Message objects.
   */
  getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    return this.dmSvc.getDirectMessages(currentUserId, targetUserId);
  }

  /**
   * Sends a direct message to a recipient.
   * Delegates to `DirectMessageService`.
   * 
   * @param content - The content of the direct message.
   * @param senderId - The ID of the sender.
   * @param recipientId - The ID of the recipient.
   * @returns A promise that resolves to the sent Message or null.
   */
  sendDirectMessage(content: string, senderId: string, recipientId: string): Promise<Message | null> {
    return this.dmSvc.sendDirectMessage(content, senderId, recipientId);
  }

  /**
   * Soft-deletes direct chat history and emits a clearing event.
   * Delegates to `DirectMessageService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the other user in the conversation.
   * @returns A promise that resolves to true if successful, false otherwise.
   */
  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    const success = await this.dmSvc.deleteDirectChatHistory(currentUserId, targetUserId);
    if (success) this.directChatCleared.emit({ currentUserId, targetUserId });
    return success;
  }

  /**
   * Retrieves the direct chat deletion timestamps map for the current user.
   * Delegates to `DirectMessageService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to a record mapping user IDs to clear timestamps.
   */
  getDirectChatDeletions(currentUserId: string): Promise<Record<string, string>> {
    return this.dmSvc.getDirectChatDeletions(currentUserId);
  }

  /**
   * Gets user IDs of DM partners the user has active conversations with.
   * Delegates to `DirectMessageService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to an array of DM partner user ID strings.
   */
  getActiveDMPartners(currentUserId: string): Promise<string[]> {
    return this.dmSvc.getActiveDMPartners(currentUserId);
  }

  /**
   * Gets all direct messages involving the current user.
   * Delegates to `DirectMessageService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to an array of DM Messages.
   */
  getAllUserDirectMessages(currentUserId: string): Promise<Message[]> {
    return this.dmSvc.getAllUserDirectMessages(currentUserId);
  }

  // ── Delegatoren: Subscriptions ────────────────────────────────────────────

  /**
   * Subscribes to real-time events for channel messages.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param channelId - The ID of the channel.
   * @param callback - Function invoked on message database operations.
   * @param broadcastCallback - Optional function invoked on typing broadcast payloads.
   * @returns A RealtimeChannel reference.
   */
  subscribeToChannelMessages(
    channelId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToChannelMessages(channelId, callback, broadcastCallback);
  }

  /**
   * Subscribes to real-time direct messages with a specific partner.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the partner user.
   * @param callback - Function invoked on message database updates.
   * @param broadcastCallback - Optional function invoked on typing status changes.
   * @returns A RealtimeChannel reference.
   */
  subscribeToDirectMessages(
    currentUserId: string,
    targetUserId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToDirectMessages(currentUserId, targetUserId, callback, broadcastCallback);
  }

  /**
   * Subscribes to replies within a thread.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param parentMessageId - The ID of the parent message.
   * @param callback - Function invoked on reply database updates.
   * @param broadcastCallback - Optional function invoked on typing status changes.
   * @returns A RealtimeChannel reference.
   */
  subscribeToThreadReplies(
    parentMessageId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToThreadReplies(parentMessageId, callback, broadcastCallback);
  }

  /**
   * Subscribes to all direct messages involving the current user.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param currentUserId - The ID of the current user.
   * @param callback - Function invoked when a new direct message is inserted.
   * @returns A RealtimeChannel reference.
   */
  subscribeToAllUserDirectMessages(
    currentUserId: string,
    callback: (message: Message) => void,
  ): RealtimeChannel {
    return this.subscriptionSvc.subscribeToAllUserDirectMessages(currentUserId, callback);
  }

  /**
   * Subscribes to channel mention notifications for a user.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param currentUserId - The ID of the user.
   * @param callback - Function invoked when the user is mentioned in a channel message.
   * @returns A RealtimeChannel reference.
   */
  subscribeToAllChannelMentions(currentUserId: string, callback: () => void): RealtimeChannel {
    return this.subscriptionSvc.subscribeToAllChannelMentions(currentUserId, callback);
  }

  /**
   * Unsubscribes from a realtime subscription channel.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param channel - The RealtimeChannel to unsubscribe from.
   * @returns A promise that resolves when unsubscribed.
   */
  unsubscribe(channel: RealtimeChannel): Promise<void> {
    return this.subscriptionSvc.unsubscribe(channel);
  }

  /**
   * Broadcasts the typing status of a user to a subscription channel.
   * Delegates to `MessageSubscriptionService`.
   * 
   * @param channel - The RealtimeChannel to broadcast to.
   * @param userId - The ID of the user typing.
   * @param userName - The display name of the user typing.
   * @param isTyping - Boolean flag representing if the user is typing.
   */
  sendTypingStatus(channel: RealtimeChannel | null, userId: string, userName: string, isTyping: boolean): void {
    this.subscriptionSvc.sendTypingStatus(channel, userId, userName, isTyping);
  }

  // ── Delegatoren: Encoding ─────────────────────────────────────────────────

  /**
   * Converts user/channel mentions in zero-width characters back to readable markup.
   * Delegates to `MessageEncodingService`.
   * 
   * @param text - The text containing zero-width sequences.
   * @returns The text with markup representation.
   */
  zeroWidthToMarkup(text: string): string {
    return this.encodingSvc.zeroWidthToMarkup(text);
  }

  /**
   * Converts markup user/channel mentions to invisible zero-width sequences.
   * Delegates to `MessageEncodingService`.
   * 
   * @param text - The raw text containing markup.
   * @param users - The list of active users.
   * @param channels - The list of active channels.
   * @returns The converted text with zero-width sequences.
   */
  markupToZeroWidth(text: string, users: User[], channels: Channel[]): string {
    return this.encodingSvc.markupToZeroWidth(text, users, channels);
  }

  /**
   * Encodes a standard string into a zero-width string representation.
   * Delegates to `MessageEncodingService`.
   * 
   * @param str - The input string.
   * @returns A string consisting entirely of zero-width characters.
   */
  encodeToZeroWidth(str: string): string {
    return this.encodingSvc.encodeToZeroWidth(str);
  }

  /**
   * Decodes a zero-width sequence string back to a readable string.
   * Delegates to `MessageEncodingService`.
   * 
   * @param zeroWidthStr - The zero-width encoded string.
   * @returns The decoded standard string.
   */
  decodeFromZeroWidth(zeroWidthStr: string): string {
    return this.encodingSvc.decodeFromZeroWidth(zeroWidthStr);
  }
}
