import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { userService } from './user.service';
import { Message } from '../interfaces/message.interface';

/**
 * Service for managing direct messages (DMs) between users, including sending,
 * retrieving, soft-deleting chat history, and constructing team welcome messages.
 */
@Injectable({
  providedIn: 'root',
})
export class DirectMessageService {
  /**
   * Supabase service instance injected for handling database operations.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * User service instance injected for loading user details and maps.
   */
  private userSvc = inject(userService);

  /**
   * A hardcoded identifier representing the local DABubble team user ID.
   */
  private readonly TEAM_USER_ID = 'dabubble-team-local-id';

  /**
   * Retrieves all direct messages exchanged between two users.
   * If the target user is the team user, returns a hardcoded welcome message instead.
   * Accounts for any previous soft deletion/clear timestamps.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the other user in the conversation.
   * @returns A promise that resolves to an array of Message objects.
   */
  async getDirectMessages(currentUserId: string, targetUserId: string): Promise<Message[]> {
    if (targetUserId === this.TEAM_USER_ID) return [this.buildTeamWelcomeMessage(currentUserId)];
    try {
      const cat = await this.getChatClearedAt(currentUserId, targetUserId);
      let q = this.supabaseSvc.supabase.from('messages').select('*').or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`).order('created_at', { ascending: true });
      const { data: msgs, error } = await (cat ? q.gt('created_at', cat) : q);
      if (error) return console.error('Error fetching direct messages:', error.message), [];
      const userMap = await this.buildUserMap();
      return (msgs as Message[]).map((m) => ({ ...m, sender: userMap.get(m.sender_id) }));
    } catch (err) {
      return console.error('Failed to get direct messages:', err), [];
    }
  }

  /**
   * Sends a direct message from the current user to a recipient.
   * 
   * @param content - The text content of the message.
   * @param senderId - The ID of the user sending the message.
   * @param recipientId - The ID of the user receiving the message.
   * @returns A promise that resolves to the sent Message object, or null if sending failed.
   */
  async sendDirectMessage(content: string, senderId: string, recipientId: string): Promise<Message | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase.from('messages').insert({ content, sender_id: senderId, recipient_id: recipientId }).select().single();
      if (error) throw (console.error('Error sending direct message:', error.message), error);
      const sender = await this.userSvc.getUserById(senderId);
      const newMessage = { ...data, created_at: data.created_at || new Date().toISOString(), sender } as Message;
      return newMessage;
    } catch (err) {
      return console.error('Failed to send direct message:', err), null;
    }
  }

  /**
   * Soft-deletes/clears the direct chat history by upserting a timestamp in the database.
   * Subsequent fetches will only retrieve messages created after this timestamp.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the other user whose conversation history is being cleared.
   * @returns A promise that resolves to true if successful, false otherwise.
   */
  async deleteDirectChatHistory(currentUserId: string, targetUserId: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseSvc.supabase.from('direct_chat_deletions')
        .upsert({ user_id: currentUserId, other_user_id: targetUserId, cleared_at: new Date().toISOString() }, { onConflict: 'user_id,other_user_id' });
      if (error) return console.error('Error saving chat deletion timestamp:', error.message), false;
      return true;
    } catch (err) {
      return console.error('Failed to soft-delete direct chat history:', err), false;
    }
  }

  /**
   * Fetches all chat deletion/clear timestamps recorded for the current user.
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to a map where key is the other user's ID and value is the cleared_at timestamp.
   */
  async getDirectChatDeletions(currentUserId: string): Promise<Record<string, string>> {
    try {
      const { data, error } = await this.supabaseSvc.supabase.from('direct_chat_deletions').select('other_user_id, cleared_at').eq('user_id', currentUserId);
      if (error) return console.error('Error fetching direct chat deletions:', error.message), {};
      const result: Record<string, string> = {};
      (data || []).forEach((r: any) => { if (r.other_user_id && r.cleared_at) result[r.other_user_id] = r.cleared_at; });
      return result;
    } catch (err) {
      return console.error('Failed to get direct chat deletions:', err), {};
    }
  }

  /**
   * Retrieves the IDs of all users with whom the current user has active direct message conversations.
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to an array of partner user ID strings.
   */
  async getActiveDMPartners(currentUserId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabaseSvc.supabase.from('messages').select('sender_id, recipient_id').or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);
      if (error) return console.error('Error fetching DM partners:', error.message), [];
      const partnerIds = new Set<string>();
      (data || []).forEach((m) => {
        if (m.sender_id && m.sender_id !== currentUserId) partnerIds.add(m.sender_id);
        if (m.recipient_id && m.recipient_id !== currentUserId) partnerIds.add(m.recipient_id);
      });
      return Array.from(partnerIds);
    } catch (err) {
      return console.error('Failed to get DM partners:', err), [];
    }
  }

  /**
   * Fetches all direct messages involving the current user (either as sender or recipient).
   * 
   * @param currentUserId - The ID of the current user.
   * @returns A promise that resolves to an array of Message objects.
   */
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

  /**
   * Checks the timestamp when the current user cleared their direct chat history with the target user.
   * 
   * @param currentUserId - The ID of the current user.
   * @param targetUserId - The ID of the other conversation member.
   * @returns A promise that resolves to the ISO timestamp string, or null if never cleared.
   */
  private async getChatClearedAt(currentUserId: string, targetUserId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseSvc.supabase.from('direct_chat_deletions').select('cleared_at').eq('user_id', currentUserId).eq('other_user_id', targetUserId).maybeSingle();
      if (error) return console.error('Error fetching chat cleared_at:', error.message), null;
      return data?.cleared_at ?? null;
    } catch (err) {
      return console.error('Failed to fetch chat cleared_at:', err), null;
    }
  }

  /**
   * Builds a Map mapping user IDs to their user profiles for fast lookup.
   * 
   * @returns A promise that resolves to a Map of user details.
   */
  private async buildUserMap(): Promise<Map<string, any>> {
    const allUsers = await this.userSvc.getAllUsers();
    return new Map(allUsers.map((u) => [u.id, u]));
  }

  /**
   * Constructs the welcome message from the DABubble-Team.
   * 
   * @param currentUserId - The ID of the recipient user.
   * @returns A mock Message object.
   */
  private buildTeamWelcomeMessage(currentUserId: string): Message {
    return {
      id: 'dabubble-team-welcome-message-id',
      content: this.getTeamWelcomeText(),
      sender_id: 'dabubble-team-local-id',
      recipient_id: currentUserId,
      created_at: new Date().toISOString(),
      reactions: {},
      sender: this.getTeamSender(),
    };
  }

  /**
   * Returns the content of the welcoming text.
   * 
   * @returns The German welcome text string.
   */
  private getTeamWelcomeText(): string {
    return 'Hallo und herzlich willkommen bei DABubble!\n\nSchön, dass du uns als Gast besuchst. Bitte beachte, dass die hier sichtbaren Kanäle und Nachrichten primär als Testobjekte dienen.\n\nDennoch ist diese Anwendung so gestaltet, dass du sie auch als Gast bereits im vollen Umfang nutzen und ausprobieren kannst: Erstelle eigene Kanäle, schreibe Nachrichten, reagiere auf Beiträge und starte Threads.\n\nFalls du später ein dauerhaftes Konto erstellen möchtest, kannst du dich jederzeit kostenlos registrieren, um deine eigenen Daten zu sichern.\n\nViel Spaß beim Testen und Erkunden wünscht dir\ndein DABubble-Team!';
  }

  /**
   * Returns a mock profile representation of the DABubble team.
   * 
   * @returns A user profile object.
   */
  private getTeamSender(): any {
    return {
      id: 'dabubble-team-local-id',
      display_name: 'DABubble-Team',
      email: 'team@dabubble.local',
      avatar_url: 'img/logo/Logo.svg',
      status: 'online',
    };
  }
}
