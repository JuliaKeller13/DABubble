import { Injectable, inject, EventEmitter } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { channelService } from './channel.service';
import { Message } from '../interfaces/message.interface';
import { RealtimeChannel } from '@supabase/supabase-js';
import { User } from '../interfaces/user.interface';
import { Channel } from '../interfaces/channel.interface';

@Injectable({
  providedIn: 'root',
})
export class messageService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);
  private channelSvc = inject(channelService);
  public messageDeleted = new EventEmitter<string>();
  public directChatCleared = new EventEmitter<{ currentUserId: string; targetUserId: string }>();
  public optimisticReaction = new EventEmitter<{ messageId: string; emoji: string; userId: string }>();
  public searchTargetMessageId: string | null = null;
  public searchTargetSelected = new EventEmitter<string>();

  
  async getChannelMessages(channelId: string): Promise<Message[]> {
    try {
      
      const { data: messages, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error.message);
        return [];
      }

      
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

  
  async sendMessage(
    content: string,
    senderId: string,
    channelId: string,
    parentMessageId?: string,
  ): Promise<Message | null> {
    try {
      const parsedContent = this.zeroWidthToMarkup(content);
      const payload: any = {
        content: parsedContent,
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

  
  private async getChatClearedAt(
    currentUserId: string,
    targetUserId: string,
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('direct_chat_deletions')
        .select('cleared_at')
        .eq('user_id', currentUserId)
        .eq('other_user_id', targetUserId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching chat cleared_at:', error.message);
        return null;
      }
      return data?.cleared_at ?? null;
    } catch (err) {
      console.error('Failed to fetch chat cleared_at:', err);
      return null;
    }
  }

  async getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    if (targetUserId === 'dabubble-team-local-id') {
      return [
        {
          id: 'dabubble-team-welcome-message-id',
          content: 'Hallo und herzlich willkommen bei DABubble!\n\nSchön, dass du uns als Gast besuchst. Bitte beachte, dass die hier sichtbaren Kanäle und Nachrichten primär als Testobjekte dienen.\n\nDennoch ist diese Anwendung so gestaltet, dass du sie auch als Gast bereits im vollen Umfang nutzen und ausprobieren kannst: Erstelle eigene Kanäle, schreibe Nachrichten, reagiere auf Beiträge und starte Threads.\n\nFalls du später ein dauerhaftes Konto erstellen möchtest, kannst du dich jederzeit kostenlos registrieren, um deine eigenen Daten zu sichern.\n\nViel Spaß beim Testen und Erkunden wünscht dir\ndein DABubble-Team!',
          sender_id: 'dabubble-team-local-id',
          recipient_id: currentUserId,
          created_at: new Date().toISOString(),
          reactions: {},
          sender: {
            id: 'dabubble-team-local-id',
            display_name: 'DABubble-Team',
            email: 'team@dabubble.local',
            avatar_url: 'img/logo/Logo.svg',
            status: 'online'
          }
        }
      ];
    }
    try {
      const clearedAt = await this.getChatClearedAt(currentUserId, targetUserId);

      let query = this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (clearedAt) {
        query = query.gt('created_at', clearedAt);
      }

      const { data: messages, error } = await query;

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

  
  async sendDirectMessage(
    content: string,
    senderId: string,
    recipientId: string,
  ): Promise<Message | null> {
    try {
      const parsedContent = this.zeroWidthToMarkup(content);
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .insert({
          content: parsedContent,
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

  
  subscribeToDirectMessages(
    currentUserId: string,
    targetUserId: string,
    callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', message: Message) => void,
    broadcastCallback?: (payload: { userId: string; userName: string; isTyping: boolean }) => void
  ): RealtimeChannel {
    if (targetUserId === 'dabubble-team-local-id') {
      return {
        isMock: true,
        unsubscribe: () => {},
        subscribe: () => { return { onDestroy: () => {} } },
        on: () => { return { subscribe: () => {} } }
      } as any;
    }
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

  
  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    if (channel && (channel as any).isMock) {
      return;
    }
    if (channel) {
      await this.supabaseSvc.supabase.removeChannel(channel);
    }
  }

  
  async toggleReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      
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
        
        userIds = userIds.filter((id) => id !== userId);
      } else {
        
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

  
  sendTypingStatus(channel: RealtimeChannel | null, userId: string, userName: string, isTyping: boolean) {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, userName, isTyping }
      });
    }
  }

  
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
          const rawMessage = payload.new as Message;
          if (!rawMessage || !rawMessage.id) return;

          
          const isDMInvolvingUs = rawMessage.recipient_id && 
            (rawMessage.sender_id === currentUserId || rawMessage.recipient_id === currentUserId);

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
      .subscribe();

    return channel;
  }

  subscribeToAllChannelMentions(
    currentUserId: string,
    callback: () => void
  ): RealtimeChannel {
    const channel = this.supabaseSvc.supabase.channel(`channel_mentions:${currentUserId}`);

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
          if (!rawMessage || !rawMessage.id || !rawMessage.channel_id) return;

          if (rawMessage.content && rawMessage.content.includes(`<@${currentUserId}>`)) {
            callback();
          }
        }
      )
      .subscribe();

    return channel;
  }

  
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

  async getChannelMentions(userId: string): Promise<Message[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('id, channel_id, created_at, content')
        .not('channel_id', 'is', null)
        .like('content', `%<@${userId}>%`);

      if (error) {
        console.error('Error fetching channel mentions:', error.message);
        return [];
      }
      return data as Message[];
    } catch (err) {
      console.error('Failed to get channel mentions:', err);
      return [];
    }
  }

  zeroWidthToMarkup(text: string): string {
    if (!text) return '';
    let result = text;

    // 1. Convert user mentions: @Name\u200BzeroWidthId -> <@userId>
    const userMentionRegex = /@([^\u200B]+)\u200B([\u200B\u200C\u200D]+)/g;
    result = result.replace(userMentionRegex, (match, name, zeroWidthId) => {
      const userId = this.decodeFromZeroWidth(zeroWidthId);
      if (userId) {
        return `<@${userId}>`;
      }
      return match;
    });

    const channels = this.channelSvc.channels();
    channels.forEach((ch) => {
      if (ch.id && ch.name) {
        const escapedName = ch.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const channelRegex = new RegExp(`(^|\\s)#${escapedName}\\b`, 'g');
        result = result.replace(channelRegex, `$1<#${ch.id}>`);
      }
    });

    return result;
  }

  markupToZeroWidth(text: string, users: User[], channels: Channel[]): string {
    if (!text) return '';
    let result = text;

    const userRegex = /<@([a-f0-9-]{36})>/gi;
    result = result.replace(userRegex, (match, userId) => {
      if (!userId) return match;
      const user = users.find((u) => u.id === userId);
      if (user) {
        const zeroWidthId = this.encodeToZeroWidth(userId);
        return `@${user.display_name}\u200B${zeroWidthId}`;
      }
      return '@Gelöschter User';
    });

    const channelRegex = /<#([a-f0-9-]{36})>/gi;
    result = result.replace(channelRegex, (match, channelId) => {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) {
        return `#${channel.name}`;
      }
      return '#Gelöschter Channel';
    });

    return result;
  }

  encodeToZeroWidth(str: string): string {
    return str
      .split('')
      .map((char) => {
        const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
        return binary
          .split('')
          .map((bit) => (bit === '0' ? '\u200C' : '\u200D'))
          .join('');
      })
      .join('\u200B');
  }

  decodeFromZeroWidth(zeroWidthStr: string): string {
    const clean = zeroWidthStr.replace(/[^\u200B\u200C\u200D]/g, '');
    if (!clean) return '';

    return clean
      .split('\u200B')
      .map((binarySeq) => {
        const binary = binarySeq
          .split('')
          .map((char) => (char === '\u200C' ? '0' : '1'))
          .join('');
        if (!binary) return '';
        return String.fromCharCode(parseInt(binary, 2));
      })
      .join('');
  }

  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    try {
      const clearedAt = new Date().toISOString();

      const { error } = await this.supabaseSvc.supabase
        .from('direct_chat_deletions')
        .upsert(
          {
            user_id: currentUserId,
            other_user_id: targetUserId,
            cleared_at: clearedAt,
          },
          { onConflict: 'user_id,other_user_id' },
        );

      if (error) {
        console.error('Error saving chat deletion timestamp:', error.message);
        return false;
      }

      this.directChatCleared.emit({ currentUserId, targetUserId });
      return true;
    } catch (err) {
      console.error('Failed to soft-delete direct chat history:', err);
      return false;
    }
  }

  async getDirectChatDeletions(currentUserId: string): Promise<Record<string, string>> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('direct_chat_deletions')
        .select('other_user_id, cleared_at')
        .eq('user_id', currentUserId);

      if (error) {
        console.error('Error fetching direct chat deletions:', error.message);
        return {};
      }

      const result: Record<string, string> = {};
      if (data) {
        data.forEach((row: any) => {
          if (row.other_user_id && row.cleared_at) {
            result[row.other_user_id] = row.cleared_at;
          }
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to get direct chat deletions:', err);
      return {};
    }
  }
}
