import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { Channel } from '../interfaces/channel.interface';
import { User } from '../interfaces/user.interface';
import { avatarService } from './avatar.service';


/**
 * Service for managing channels, including fetching, creating, updating,
 * and deleting channels, as well as managing channel memberships.
 */
@Injectable({
  providedIn: 'root'
})
export class channelService {
  /**
   * Supabase service instance injected for handling database operations.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * Avatar service instance injected for managing and normalizing avatar URLs.
   */
  private avatarSvc = inject(avatarService);

  /**
   * Signal representing the currently selected channel, or null if no channel is selected.
   */
  private activeChannelSignal = signal<Channel | null>(null);

  /**
   * Signal holding the list of channels the user is currently associated with.
   */
  private channelsSignal = signal<Channel[]>([]);
  
  /**
   * Signal containing the list of user members belonging to the active channel.
   */
  private activeChannelMembersSignal = signal<User[]>([]);

  /**
   * Signal representing whether new message mode is active.
   */
  public isNewMessageModeActive = signal<boolean>(false);

  /**
   * Signal representing whether the channel list is in the process of initializing.
   */
  public isInitializing = signal<boolean>(true);

  /**
   * Read-only representation of the active channel.
   */
  readonly activeChannel = this.activeChannelSignal.asReadonly();

  /**
   * Read-only representation of the list of user's channels.
   */
  readonly channels = this.channelsSignal.asReadonly();

  /**
   * Read-only representation of the members of the active channel.
   */
  readonly activeChannelMembers = this.activeChannelMembersSignal.asReadonly();

  /**
   * Sets whether new message mode is active.
   * If true, deselects any currently active channel.
   * 
   * @param active - Boolean flag indicating if new message mode should be enabled.
   */
  setNewMessageMode(active: boolean) {
    this.isNewMessageModeActive.set(active);
    if (active) {
      this.selectChannel(null);
    }
  }

  /**
   * Selects a channel as the active channel and fetches its member users.
   * Turns off new message mode if a channel is successfully selected.
   * 
   * @param channel - The Channel object to select, or null to deselect.
   */
  async selectChannel(channel: Channel | null) {
    this.activeChannelSignal.set(channel);
    if (channel) this.isNewMessageModeActive.set(false);
    if (channel?.id) {
      try {
        this.activeChannelMembersSignal.set(await this.getChannelMembers(channel.id));
      } catch (e) {
        console.error('Error loading channel members in selectChannel:', e);
        this.activeChannelMembersSignal.set([]);
      }
    } else this.activeChannelMembersSignal.set([]);
  }

  /**
   * Refreshes the members of the active channel by querying the database.
   * 
   * @returns A promise that resolves to an array of User objects in the active channel.
   */
  async refreshActiveChannelMembers(): Promise<User[]> {
    const active = this.activeChannel();
    if (active && active.id) {
      try {
        const members = await this.getChannelMembers(active.id);
        this.activeChannelMembersSignal.set(members);
        return members;
      } catch (e) {
        console.error('Error refreshing active channel members:', e);
      }
    }
    return [];
  }

  /**
   * Cache array to store loaded channels.
   */
  private channelsListCache: Channel[] = [];

  /**
   * Clears the cached channels list.
   */
  clearCache() {
    this.channelsListCache = [];
  }

  /**
   * Resets all cached channels, signals, and states of the service.
   */
  clearState() {
    this.channelsListCache = [];
    this.activeChannelSignal.set(null);
    this.channelsSignal.set([]);
    this.activeChannelMembersSignal.set([]);
    this.isNewMessageModeActive.set(false);
  }

  /**
   * Loads user channels from cache or fetches them from the database.
   * 
   * @param forceRefresh - If true, bypasses the cache and forces a database query.
   * @returns A promise that resolves to the loaded array of Channels.
   */
  async loadChannels(forceRefresh = false): Promise<Channel[]> {
    if (!forceRefresh && this.channelsListCache.length > 0) {
      this.channelsSignal.set(this.channelsListCache);
      return this.channelsListCache;
    }
    const fetched = await this.getChannels();
    this.channelsListCache = fetched;
    this.channelsSignal.set(fetched);
    return fetched;
  }

  /**
   * Fetches channels that the currently authenticated user belongs to.
   * 
   * @returns A promise that resolves to the array of Channels.
   */
  async getChannels(): Promise<Channel[]> {
    const { data: { user }, error } = await this.supabaseSvc.supabase.auth.getUser();
    if (error || !user) return console.warn('No auth user fetching channels'), [];
    const ids = await this.getMemberChannelIds(user.id);
    return ids.length > 0 ? this.getChannelsByIds(ids) : [];
  }

  /**
   * Fetches the IDs of channels that a given user is a member of.
   * 
   * @param userId - The unique identifier of the user.
   * @returns A promise that resolves to an array of channel ID strings.
   */
  private async getMemberChannelIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').select('channel_id').eq('user_id', userId);
    if (error) return console.error('Error fetching channel memberships:', error.message), [];
    return (data || []).map((m: any) => m.channel_id);
  }

  /**
   * Fetches multiple channels matching the provided list of channel IDs.
   * 
   * @param ids - An array of channel ID strings.
   * @returns A promise that resolves to the array of Channels.
   */
  private async getChannelsByIds(ids: string[]): Promise<Channel[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels').select('*').in('id', ids);
    if (error) return console.error('Error fetching channels:', error.message), [];
    return data as Channel[];
  }

  /**
   * Checks whether a channel name already exists in the database.
   * 
   * @param name - The channel name to look up.
   * @returns A promise that resolves to true if duplicate name exists, otherwise false.
   */
  async isChannelNameDuplicate(name: string): Promise<boolean> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .select('id')
      .eq('name', name.trim());

    if (error) {
      console.error('Error checking duplicate channel name:', error.message);
      return false;
    }
    return !!data && data.length > 0;
  }

  /**
   * Creates a new channel and automatically adds the creator as a member.
   * Clears the local cache and reloads the channel list.
   * 
   * @param channel - The Channel object with details for creation.
   * @returns A promise that resolves to the database insert response.
   */
  async createChannel(channel: Channel): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels')
      .insert({ name: channel.name, description: channel.description, created_by: channel.created_by }).select();
    if (error) throw (console.error('Error creating channel:', error.message), error);
    const active = data?.[0];
    if (active?.id && channel.created_by) {
      await this.addMembersToChannel(active.id, [channel.created_by]);
    }
    this.clearCache();
    await this.loadChannels();
    return data;
  }

  /**
   * Updates an existing channel's info in the database and local state.
   * 
   * @param id - The ID of the channel to update.
   * @param updates - A partial Channel object containing the attributes to update.
   * @returns A promise that resolves to the database update response.
   */
  async updateChannel(id: string, updates: Partial<Channel>): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels').update(updates).eq('id', id).select();
    if (error) throw (console.error('Error updating channel:', error.message), error);
    this.channelsListCache = this.channelsListCache.map(c => c.id === id ? { ...c, ...updates } : c);
    this.channelsSignal.set(this.channelsSignal().map(c => c.id === id ? { ...c, ...updates } : c));
    const active = this.activeChannel();
    if (active?.id === id) this.activeChannelSignal.set({ ...active, ...updates });
    return data;
  }

  /**
   * Deletes a channel from the database. Re-selects a different active channel if needed.
   * 
   * @param id - The ID of the channel to delete.
   * @returns A promise that resolves to the database deletion response.
   */
  async deleteChannel(id: string): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels').delete().eq('id', id).select();
    if (error) throw (console.error('Error deleting channel:', error.message), error);
    this.channelsListCache = this.channelsListCache.filter(c => c.id !== id);
    this.channelsSignal.set(this.channelsSignal().filter(c => c.id !== id));
    const active = this.activeChannel();
    if (active?.id === id) {
      const remaining = this.channels();
      this.activeChannelSignal.set(remaining.length > 0 ? remaining[0] : null);
    }
    return data;
  }

  /**
   * Adds specified users to a channel by inserting them into the channel members join table.
   * Ignores users who are already members.
   * 
   * @param channelId - The ID of the channel.
   * @param userIds - An array of user ID strings to add.
   * @returns A promise that resolves to the insert database response.
   */
  async addMembersToChannel(channelId: string, userIds: string[]): Promise<any> {
    if (userIds.length === 0) return [];
    const { data: existing, error: fe } = await this.supabaseSvc.supabase.from('channel_members').select('user_id').eq('channel_id', channelId);
    if (fe) throw (console.error('Error fetching existing channel members:', fe.message), fe);
    const existingUserIds = new Set((existing || []).map(row => row.user_id));
    const newIds = userIds.filter(id => !existingUserIds.has(id));
    if (newIds.length === 0) return [];
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').insert(newIds.map(uId => ({ channel_id: channelId, user_id: uId }))).select();
    if (error) throw (console.error('Error adding members to channel:', error.message), error);
    return data;
  }

  /**
   * Removes a member from a channel. Clears cached channel data.
   * 
   * @param channelId - The ID of the channel.
   * @param userId - The ID of the user to remove.
   * @returns A promise that resolves to the deletion database response.
   */
  async removeMemberFromChannel(channelId: string, userId: string): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', userId).select();
    if (error) throw (console.error('Error removing member from channel:', error.message), error);
    this.clearCache();
    return data;
  }

  /**
   * Retrieves all member users of a channel, normalizing their avatar URLs.
   * 
   * @param channelId - The ID of the channel.
   * @returns A promise that resolves to an array of User objects representing the channel members.
   */
  async getChannelMembers(channelId: string): Promise<User[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').select('profiles(*)').eq('channel_id', channelId);
    if (error) return console.error('Error fetching channel members:', error.message), [];
    return ((data as any[]) || [])
      .map(item => item.profiles)
      .filter((p): p is User => p !== null && p !== undefined)
      .map((profile) => ({ ...profile, avatar_url: this.avatarSvc.normalizeAvatarUrl(profile.avatar_url || '') || profile.avatar_url }));
  }
}