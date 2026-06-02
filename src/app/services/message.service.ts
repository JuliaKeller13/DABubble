import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);

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
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      return (messages as Message[]).map(msg => ({
        ...msg,
        sender: userMap.get(msg.sender_id)
      }));
    } catch (err) {
      console.error('Failed to get channel messages:', err);
      return [];
    }
  }

  // Insert a new message into Supabase
  async sendMessage(content: string, senderId: string, channelId: string, parentMessageId?: string): Promise<Message | null> {
    try {
      const payload: any = {
        content,
        sender_id: senderId,
        channel_id: channelId
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

  // Subscribe to real-time additions and updates for a channel's messages
  subscribeToChannelMessages(
    channelId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`room:${channelId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`
        },
        async (payload) => {
          const eventType = payload.eventType;
          let rawMessage = (payload.new || payload.old) as Message;
          if (!rawMessage || !rawMessage.id) return;

          if (eventType === 'DELETE') {
            callback('DELETE', rawMessage);
            return;
          }

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
        userIds = userIds.filter(id => id !== userId);
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
}
