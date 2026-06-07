import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';

@Injectable({
  providedIn: 'root',
})
export class DirectMessageService {
  private supabaseSvc = inject(supabaseService);
  private userSvc = inject(userService);

  private readonly TEAM_USER_ID = 'dabubble-team-local-id';

  async getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    if (targetUserId === this.TEAM_USER_ID) {
      return [this.buildTeamWelcomeMessage(currentUserId)];
    }
    try {
      const clearedAt = await this.getChatClearedAt(currentUserId, targetUserId);
      let query = this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });
      if (clearedAt) query = query.gt('created_at', clearedAt);
      const { data: messages, error } = await query;
      if (error) { console.error('Error fetching direct messages:', error.message); return []; }
      const userMap = await this.buildUserMap();
      return (messages as Message[]).map((msg) => ({ ...msg, sender: userMap.get(msg.sender_id) }));
    } catch (err) {
      console.error('Failed to get direct messages:', err);
      return [];
    }
  }

  async sendDirectMessage(content: string, senderId: string, recipientId: string): Promise<Message | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .insert({ content, sender_id: senderId, recipient_id: recipientId })
        .select()
        .single();
      if (error) { console.error('Error sending direct message:', error.message); throw error; }
      const sender = await this.userSvc.getUserById(senderId);
      const newMessage = data as Message;
      if (!newMessage.created_at) newMessage.created_at = new Date().toISOString();
      if (sender) newMessage.sender = sender;
      return newMessage;
    } catch (err) {
      console.error('Failed to send direct message:', err);
      return null;
    }
  }

  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    try {
      const clearedAt = new Date().toISOString();
      const { error } = await this.supabaseSvc.supabase
        .from('direct_chat_deletions')
        .upsert(
          { user_id: currentUserId, other_user_id: targetUserId, cleared_at: clearedAt },
          { onConflict: 'user_id,other_user_id' },
        );
      if (error) { console.error('Error saving chat deletion timestamp:', error.message); return false; }
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
      if (error) { console.error('Error fetching direct chat deletions:', error.message); return {}; }
      const result: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        if (row.other_user_id && row.cleared_at) result[row.other_user_id] = row.cleared_at;
      });
      return result;
    } catch (err) {
      console.error('Failed to get direct chat deletions:', err);
      return {};
    }
  }

  async getActiveDMPartners(currentUserId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);
      if (error) { console.error('Error fetching DM partners:', error.message); return []; }
      const partnerIds = new Set<string>();
      (data || []).forEach((msg) => {
        if (!msg.recipient_id) return;
        if (msg.sender_id && msg.sender_id !== currentUserId) partnerIds.add(msg.sender_id);
        if (msg.recipient_id && msg.recipient_id !== currentUserId) partnerIds.add(msg.recipient_id);
      });
      return Array.from(partnerIds);
    } catch (err) {
      console.error('Failed to get DM partners:', err);
      return [];
    }
  }

  async getAllUserDirectMessages(currentUserId: string): Promise<Message[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order('created_at', { ascending: true });
      if (error) { console.error('Error fetching all user direct messages:', error.message); return []; }
      return data as Message[];
    } catch (err) {
      console.error('Failed to get all user direct messages:', err);
      return [];
    }
  }

  private async getChatClearedAt(currentUserId: string, targetUserId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('direct_chat_deletions')
        .select('cleared_at')
        .eq('user_id', currentUserId)
        .eq('other_user_id', targetUserId)
        .maybeSingle();
      if (error) { console.error('Error fetching chat cleared_at:', error.message); return null; }
      return data?.cleared_at ?? null;
    } catch (err) {
      console.error('Failed to fetch chat cleared_at:', err);
      return null;
    }
  }

  private async buildUserMap(): Promise<Map<string, any>> {
    const allUsers = await this.userSvc.getAllUsers();
    return new Map(allUsers.map((u) => [u.id, u]));
  }

  private buildTeamWelcomeMessage(currentUserId: string): Message {
    return {
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
        status: 'online',
      },
    };
  }
}
