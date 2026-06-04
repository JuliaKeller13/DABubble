import { Injectable, inject, EventEmitter } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);
  public messageDeleted = new EventEmitter<string>();

  // Fetch all messages for a specific channel and join the sender profile
  async getChannelMessages(channelId: string): Promise<Message[]> {
    try {
      // Fetch messages first
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error.message);
        return [];
      }

      // Fetch all user profiles to map them in memory (resilient to FK naming schema issues)
      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      return (messages as Message[]).map((msg) => ({
        ...msg,
        sender: userMap.get(msg.sender_id),
      }));
    } catch (err) {
      console.error('Failed to get channel messages:', err);
      return [];
    }
  }

  // Insert a new message into Supabase
  async sendMessage(
    content: string,
    senderId: string,
    channelId: string,
    parentMessageId?: string,
  ): Promise<Message | null> {
    try {
      const payload: any = {
        content,
        sender_id: senderId,
        channel_id: channelId,
      };

      if (parentMessageId) {
        payload.parent_id = parentMessageId;
      }

      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error.message);
        throw error;
      }

      // Map the sender profile to the returned message
      const sender = await this.userSvc.getUserById(senderId);
      const newMessage = data as Message;
      if (newMessage && !newMessage.created_at) {
        newMessage.created_at = new Date().toISOString();
      }
      if (sender && newMessage) {
        newMessage.sender = sender;
      }
      return newMessage;
    } catch (err) {
      console.error('Failed to send message:', err);
      return null;
    }
  }

  // Deletes a message from Supabase by its ID
  async deleteMessage(msgId: string): Promise<void> {
    this.messageDeleted.emit(msgId);
    try {
      await this.supabaseSvc.supabase
        .from('messages')
        .delete()
        .eq('id', msgId);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  }

  // Fetch all direct messages between two users and join their sender profile
  async getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching direct messages:', error.message);
        return [];
      }

      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      return (messages as Message[]).map((msg) => ({
        ...msg,
        sender: userMap.get(msg.sender_id),
      }));
    } catch (err) {
      console.error('Failed to get direct messages:', err);
      return [];
    }
  }

  // Send a new direct message to a user
  async sendDirectMessage(
    content: string,
    senderId: string,
    recipientId: string,
  ): Promise<Message | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .insert({
          content,
          sender_id: senderId,
          recipient_id: recipientId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending direct message:', error.message);
        throw error;
      }

      const sender = await this.userSvc.getUserById(senderId);
      const newMessage = data as Message;
      if (newMessage && !newMessage.created_at) {
        newMessage.created_at = new Date().toISOString();
      }
      if (sender && newMessage) {
        newMessage.sender = sender;
      }
      return newMessage;
    } catch (err) {
      console.error('Failed to send direct message:', err);
      return null;
    }
  }

  // Subscribe to real-time additions, updates and deletions for direct messages between two users
  subscribeToDirectMessages(
    currentUserId: string,
    targetUserId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void
  ): RealtimeChannel {
    const sortedIds = [currentUserId, targetUserId].sort();
    const channel = this.supabaseSvc.supabase.channel(`direct:${sortedIds[0]}_${sortedIds[1]}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const eventType = payload.eventType;
          let rawMessage = (payload.new || payload.old) as Message;
          if (!rawMessage || !rawMessage.id) return;

          if (eventType === 'DELETE') {
            callback('DELETE', rawMessage);
            return;
          }

          const isFromUs = rawMessage.sender_id === currentUserId && rawMessage.recipient_id === targetUserId;
          const isToUs = rawMessage.sender_id === targetUserId && rawMessage.recipient_id === currentUserId;

          if (!isFromUs && !isToUs) return;

          if (rawMessage.sender_id) {
            const senderProfile = await this.userSvc.getUserById(rawMessage.sender_id);
            if (senderProfile) {
              rawMessage.sender = senderProfile;
            }
          }

          callback(eventType as 'INSERT' | 'UPDATE', rawMessage);
        }
      )
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: any) => {
          if (broadcastCallback && payload.payload) {
            broadcastCallback(payload.payload);
          }
        }
      )
      .subscribe();

    return channel;
  }

  // Subscribe to real-time additions and updates for a channel's messages
  subscribeToChannelMessages(
    channelId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string, userName: string, isTyping: boolean }) => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`room:${channelId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const eventType = payload.eventType;
          let rawMessage = (payload.new || payload.old) as Message;
          if (!rawMessage || !rawMessage.id) return;

          if (eventType === 'DELETE') {
            callback('DELETE', rawMessage);
            return;
          }

          if (rawMessage.channel_id !== channelId) return;

          // Fetch sender profile to attach to real-time message
          if (rawMessage.sender_id) {
            const senderProfile = await this.userSvc.getUserById(rawMessage.sender_id);
            if (senderProfile) {
              rawMessage.sender = senderProfile;
            }
          }

          callback(eventType as 'INSERT' | 'UPDATE', rawMessage);
        }
      )
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: any) => {
          if (broadcastCallback && payload.payload) {
            broadcastCallback(payload.payload);
          }
        }
      )
      .subscribe();

    return channel;
  }

  // Unsubscribe from a realtime channel subscription
  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    if (channel) {
      await this.supabaseSvc.supabase.removeChannel(channel);
    }
  }

  // Add or toggle a user's reaction (emoji) on a message
  async toggleReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      // Get the existing reactions first
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      if (error) {
        console.error('Error fetching reaction for toggle:', error.message);
        return;
      }

      const reactions = (data?.reactions as Record<string, string[]>) || {};
      let userIds = reactions[emoji] || [];

      if (userIds.includes(userId)) {
        // Toggle off: remove user ID
        userIds = userIds.filter((id) => id !== userId);
      } else {
        // Toggle on: add user ID
        userIds.push(userId);
      }

      if (userIds.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = userIds;
      }

      const { error: updateError } = await this.supabaseSvc.supabase
        .from('messages')
        .update({ reactions })
        .eq('id', messageId);

      if (updateError) {
        console.error('Error updating reaction:', updateError.message);
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }

  // Fetch all replies for a thread by parent message ID
  async getThreadReplies(parentMessageId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .eq('parent_id', parentMessageId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error fetching replies:', error.message);
        return [];
      }
      const allUsers = await this.userSvc.getAllUsers();
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      return (messages as Message[]).map((msg) => ({
        ...msg,
        sender: userMap.get(msg.sender_id),
      }));
    } catch (err) {
      console.error('Failed to get thread replies:', err);
      return [];
    }
  }

  // Subscribe to real-time additions, updates, and deletions for replies in a thread
  subscribeToThreadReplies(
    parentMessageId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string, userName: string, isTyping: boolean }) => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`thread:${parentMessageId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const eventType = payload.eventType;
          let rawMessage = (payload.new || payload.old) as Message;
          if (!rawMessage || !rawMessage.id) return;
          if (eventType === 'DELETE') {
            callback('DELETE', rawMessage);
            return;
          }
          if (rawMessage.parent_id !== parentMessageId) return;
          if (rawMessage.sender_id) {
            const senderProfile = await this.userSvc.getUserById(rawMessage.sender_id);
            if (senderProfile) {
              rawMessage.sender = senderProfile;
            }
          }
          callback(eventType as 'INSERT' | 'UPDATE', rawMessage);
        },
      )
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: any) => {
          if (broadcastCallback && payload.payload) {
            broadcastCallback(payload.payload);
          }
        }
      )
      .subscribe();
    return channel;
  }

  // Sends typing status broadcast to a Supabase channel
  sendTypingStatus(channel: RealtimeChannel | null, userId: string, userName: string, isTyping: boolean) {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, userName, isTyping }
      });
    }
  }

  // Subscribe to all incoming direct messages sent to the current user
  subscribeToAllIncomingDirectMessages(
    currentUserId: string,
    callback: (message: Message) => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`incoming_dms:${currentUserId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const rawMessage = payload.new as Message;
          if (!rawMessage || !rawMessage.id || rawMessage.recipient_id !== currentUserId) return;

          if (rawMessage.sender_id) {
            const senderProfile = await this.userSvc.getUserById(rawMessage.sender_id);
            if (senderProfile) {
              rawMessage.sender = senderProfile;
            }
          }

          callback(rawMessage);
        }
      )
      .subscribe();

    return channel;
  }

  // Get unique user IDs of contacts we have message history with
  async getActiveDMPartners(currentUserId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);

      if (error) {
        console.error('Error fetching DM partners:', error.message);
        return [];
      }

      const partnerIds = new Set<string>();
      (data || []).forEach((msg) => {
        if (msg.recipient_id) {
          if (msg.sender_id && msg.sender_id !== currentUserId) {
            partnerIds.add(msg.sender_id);
          }
          if (msg.recipient_id && msg.recipient_id !== currentUserId) {
            partnerIds.add(msg.recipient_id);
          }
        }
      });

      return Array.from(partnerIds);
    } catch (err) {
      console.error('Failed to get DM partners:', err);
      return [];
    }
  }

  // Subscribe to all direct messages involving the current user (sent or received)
  subscribeToAllUserDirectMessages(
    currentUserId: string,
    callback: (message: Message) => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`all_user_dms:${currentUserId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          console.log('[Realtime DM] New message payload received:', payload);
          const rawMessage = payload.new as Message;
          if (!rawMessage || !rawMessage.id) return;

          // Only trigger if it is a DM involving the current user
          const isDMInvolvingUs = rawMessage.recipient_id && 
            (rawMessage.sender_id === currentUserId || rawMessage.recipient_id === currentUserId);

          console.log('[Realtime DM] Is DM involving us?', isDMInvolvingUs, {
            recipient_id: rawMessage.recipient_id,
            sender_id: rawMessage.sender_id,
            currentUserId
          });

          if (!isDMInvolvingUs) return;

          if (rawMessage.sender_id) {
            const senderProfile = await this.userSvc.getUserById(rawMessage.sender_id);
            if (senderProfile) {
              rawMessage.sender = senderProfile;
            }
          }

          callback(rawMessage);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime DM] Channel subscription status:', status);
      });

    return channel;
  }

  // Fetch all direct messages involving the current user (sent or received)
  async getAllUserDirectMessages(currentUserId: string): Promise<Message[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching all user direct messages:', error.message);
        return [];
      }
      return data as Message[];
    } catch (err) {
      console.error('Failed to get all user direct messages:', err);
      return [];
    }
  }

  // Delete all direct messages between two users
  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseSvc.supabase
        .from('messages')
        .delete()
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`);

      if (error) {
        console.error('Error deleting direct chat history:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to delete direct chat history:', err);
      return false;
    }
  }
}
