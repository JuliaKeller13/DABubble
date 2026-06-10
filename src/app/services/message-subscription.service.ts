import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Type representing database event types for messages.
 */
type MessageEvent = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Callback function type invoked when a message change event occurs in the database.
 */
type MessageCallback = (event: MessageEvent, message: Message) => void;

/**
 * Payload structure for transmitting a user's typing status.
 */
type TypingPayload = { userId: string; userName: string; isTyping: boolean };

/**
 * Callback function type invoked when typing status changes are broadcasted.
 */
type TypingCallback = (payload: TypingPayload) => void;

@Injectable({
  providedIn: 'root',
})
/**
 * Service that manages realtime subscriptions using Supabase channels.
 * It supports listening to message databases changes (INSERT, UPDATE, DELETE),
 * direct messages, thread replies, and broadcasting/receiving typing indicator statuses.
 */
export class MessageSubscriptionService {
  /**
   * The injected Supabase service instance.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * The injected user service instance.
   */
  private userSvc = inject(userService);

  /**
   * Unsubscribes and cleans up the specified realtime channel.
   *
   * @param channel - The Supabase RealtimeChannel instance to unsubscribe from.
   * @returns A promise that resolves when the channel is removed.
   */
  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    if (channel && (channel as any)['isMock']) return;
    if (channel) await this.supabaseSvc.supabase.removeChannel(channel);
  }

  /**
   * Broadcasts the user's typing status on a realtime channel.
   *
   * @param channel - The active channel to broadcast on.
   * @param userId - The ID of the typing user.
   * @param userName - The name of the typing user.
   * @param isTyping - Boolean flag representing whether the user is typing.
   */
  sendTypingStatus(
    channel: RealtimeChannel | null,
    userId: string,
    userName: string,
    isTyping: boolean,
  ): void {
    channel?.send({ type: 'broadcast', event: 'typing', payload: { userId, userName, isTyping } });
  }

  /**
   * Subscribes to PostgreSQL database changes for message inserts, updates, and deletes
   * belonging to a specific channel, and listens to user typing broadcasts.
   *
   * @param channelId - The ID of the room or channel.
   * @param callback - Callback executed on database message changes.
   * @param broadcastCallback - Optional callback executed on typing status changes.
   * @returns The active Supabase RealtimeChannel.
   */
  subscribeToChannelMessages(
    channelId: string,
    callback: MessageCallback,
    broadcastCallback?: TypingCallback,
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`room:${channelId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const eventType = payload.eventType;
        let rawMessage = (payload.new || payload.old) as Message;
        if (!rawMessage?.id) return;
        if (eventType === 'DELETE') { callback('DELETE', rawMessage); return; }
        if (rawMessage.channel_id !== channelId) return;
        rawMessage = await this.attachSender(rawMessage);
        callback(eventType as MessageEvent, rawMessage);
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (broadcastCallback && payload.payload) broadcastCallback(payload.payload);
      })
      .subscribe();
    return channel;
  }

  /**
   * Subscribes to PostgreSQL database changes for direct messages between the current user
   * and a target user, and listens to typing status broadcasts.
   *
   * @param currentUserId - The ID of the currently logged-in user.
   * @param targetUserId - The ID of the user they are messaging.
   * @param callback - Callback executed on database message changes.
   * @param broadcastCallback - Optional callback executed on typing status changes.
   * @returns The active Supabase RealtimeChannel (or a mock channel if target ID is mock).
   */
  subscribeToDirectMessages(
    currentUserId: string,
    targetUserId: string,
    callback: MessageCallback,
    broadcastCallback?: TypingCallback,
  ): RealtimeChannel {
    if (targetUserId === 'dabubble-team-local-id') {
      return { isMock: true } as any;
    }
    const sortedIds = [currentUserId, targetUserId].sort();
    const channel = this.supabaseSvc.supabase.channel(`direct:${sortedIds[0]}_${sortedIds[1]}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const eventType = payload.eventType;
        let rawMessage = (payload.new || payload.old) as Message;
        if (!rawMessage?.id) return;
        if (eventType === 'DELETE') { callback('DELETE', rawMessage); return; }
        const isFromUs = rawMessage.sender_id === currentUserId && rawMessage.recipient_id === targetUserId;
        const isToUs = rawMessage.sender_id === targetUserId && rawMessage.recipient_id === currentUserId;
        if (!isFromUs && !isToUs) return;
        rawMessage = await this.attachSender(rawMessage);
        callback(eventType as MessageEvent, rawMessage);
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (broadcastCallback && payload.payload) broadcastCallback(payload.payload);
      })
      .subscribe();
    return channel;
  }

  /**
   * Subscribes to PostgreSQL database changes for replies belonging to a specific parent message thread,
   * and listens to typing status broadcasts.
   *
   * @param parentMessageId - The ID of the parent message/thread.
   * @param callback - Callback executed on database message changes.
   * @param broadcastCallback - Optional callback executed on typing status changes.
   * @returns The active Supabase RealtimeChannel.
   */
  subscribeToThreadReplies(
    parentMessageId: string,
    callback: MessageCallback,
    broadcastCallback?: TypingCallback,
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`thread:${parentMessageId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        const eventType = payload.eventType;
        let rawMessage = (payload.new || payload.old) as Message;
        if (!rawMessage?.id) return;
        if (eventType === 'DELETE') { callback('DELETE', rawMessage); return; }
        if (rawMessage.parent_id !== parentMessageId) return;
        rawMessage = await this.attachSender(rawMessage);
        callback(eventType as MessageEvent, rawMessage);
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (broadcastCallback && payload.payload) broadcastCallback(payload.payload);
      })
      .subscribe();
    return channel;
  }

  /**
   * Subscribes to all incoming direct messages involving the current user.
   *
   * @param currentUserId - The ID of the currently logged-in user.
   * @param callback - Callback executed when a new direct message involving the user is inserted.
   * @returns The active Supabase RealtimeChannel.
   */
  subscribeToAllUserDirectMessages(
    currentUserId: string,
    callback: (message: Message) => void,
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`all_user_dms:${currentUserId}`);
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        let rawMessage = payload.new as Message;
        if (!rawMessage?.id) return;
        const isDMInvolvingUs =
          rawMessage.recipient_id &&
          (rawMessage.sender_id === currentUserId || rawMessage.recipient_id === currentUserId);
        if (!isDMInvolvingUs) return;
        rawMessage = await this.attachSender(rawMessage);
        callback(rawMessage);
      })
      .subscribe();
    return channel;
  }

  /**
   * Subscribes to PostgreSQL database inserts to detect user mentions (`<@userId>`) in channel messages.
   *
   * @param currentUserId - The ID of the currently logged-in user.
   * @param callback - Callback executed when a mention of the current user is detected in a new message.
   * @returns The active Supabase RealtimeChannel.
   */
  subscribeToAllChannelMentions(
    currentUserId: string,
    callback: () => void,
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`channel_mentions:${currentUserId}`);
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const rawMessage = payload.new as Message;
        if (!rawMessage?.id || !rawMessage.channel_id) return;
        if (rawMessage.content?.includes(`<@${currentUserId}>`)) callback();
      })
      .subscribe();
    return channel;
  }

  /**
   * Internal method that asynchronously loads and assigns user details of a message sender.
   *
   * @param message - The raw message record.
   * @returns A promise that resolves to the message with populated sender profile information.
   */
  private async attachSender(message: Message): Promise<Message> {
    if (!message.sender_id) return message;
    const sender = await this.userSvc.getUserById(message.sender_id);
    return sender ? { ...message, sender } : message;
  }
}
