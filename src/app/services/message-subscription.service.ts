import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

type MessageEvent = 'INSERT' | 'UPDATE' | 'DELETE';
type MessageCallback = (event: MessageEvent, message: Message) => void;
type TypingPayload = { userId: string; userName: string; isTyping: boolean };
type TypingCallback = (payload: TypingPayload) => void;

@Injectable({
  providedIn: 'root',
})
export class MessageSubscriptionService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);

  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    if (channel && (channel as any)['isMock']) return;
    if (channel) await this.supabaseSvc.supabase.removeChannel(channel);
  }

  sendTypingStatus(
    channel: RealtimeChannel | null,
    userId: string,
    userName: string,
    isTyping: boolean,
  ): void {
    channel?.send({ type: 'broadcast', event: 'typing', payload: { userId, userName, isTyping } });
  }

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

  private async attachSender(message: Message): Promise<Message> {
    if (!message.sender_id) return message;
    const sender = await this.userSvc.getUserById(message.sender_id);
    return sender ? { ...message, sender } : message;
  }
}
