import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { Channel } from '../interfaces/channel.interface';
import { User } from '../interfaces/user.interface';
import { avatarService } from './avatar.service';


@Injectable({
  providedIn: 'root'
})
export class channelService {
  private supabaseSvc = inject(supabaseService);
  private avatarSvc = inject(avatarService);
  private activeChannelSignal = signal<Channel | null>(null);
  private channelsSignal = signal<Channel[]>([]);
  
  private activeChannelMembersSignal = signal<User[]>([]);
  public isNewMessageModeActive = signal<boolean>(false);
  public isInitializing = signal<boolean>(true);

  
  readonly activeChannel = this.activeChannelSignal.asReadonly();
  readonly channels = this.channelsSignal.asReadonly();
  readonly activeChannelMembers = this.activeChannelMembersSignal.asReadonly();

  setNewMessageMode(active: boolean) {
    this.isNewMessageModeActive.set(active);
    if (active) {
      this.selectChannel(null);
    }
  }

  
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

  
  private channelsListCache: Channel[] = [];

  clearCache() {
    this.channelsListCache = [];
  }

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

  
  async getChannels(): Promise<Channel[]> {
    const { data: { user }, error } = await this.supabaseSvc.supabase.auth.getUser();
    if (error || !user) return console.warn('No auth user fetching channels'), [];
    const ids = await this.getMemberChannelIds(user.id);
    return ids.length > 0 ? this.getChannelsByIds(ids) : [];
  }

  private async getMemberChannelIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').select('channel_id').eq('user_id', userId);
    if (error) return console.error('Error fetching channel memberships:', error.message), [];
    return (data || []).map((m: any) => m.channel_id);
  }

  private async getChannelsByIds(ids: string[]): Promise<Channel[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels').select('*').in('id', ids);
    if (error) return console.error('Error fetching channels:', error.message), [];
    return data as Channel[];
  }

  
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

  
  async updateChannel(id: string, updates: Partial<Channel>): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channels').update(updates).eq('id', id).select();
    if (error) throw (console.error('Error updating channel:', error.message), error);
    this.channelsListCache = this.channelsListCache.map(c => c.id === id ? { ...c, ...updates } : c);
    this.channelsSignal.set(this.channelsSignal().map(c => c.id === id ? { ...c, ...updates } : c));
    const active = this.activeChannel();
    if (active?.id === id) this.activeChannelSignal.set({ ...active, ...updates });
    return data;
  }

  
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

  
  async removeMemberFromChannel(channelId: string, userId: string): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', userId).select();
    if (error) throw (console.error('Error removing member from channel:', error.message), error);
    this.clearCache();
    return data;
  }

  
  async getChannelMembers(channelId: string): Promise<User[]> {
    const { data, error } = await this.supabaseSvc.supabase.from('channel_members').select('profiles(*)').eq('channel_id', channelId);
    if (error) return console.error('Error fetching channel members:', error.message), [];
    return ((data as any[]) || [])
      .map(item => item.profiles)
      .filter((p): p is User => p !== null && p !== undefined)
      .map((profile) => ({ ...profile, avatar_url: this.avatarSvc.normalizeAvatarUrl(profile.avatar_url || '') || profile.avatar_url }));
  }
}