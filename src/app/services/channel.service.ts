import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { Channel } from '../interfaces/channel.interface';
import { User } from '../interfaces/user.interface';


@Injectable({
  providedIn: 'root'
})
export class channelService {
  private supabaseSvc = inject(supabaseService);
  private activeChannelSignal = signal<Channel | null>(null);
  private channelsSignal = signal<Channel[]>([]);
  
  // Expose the active channel and channels list as read-only signals
  readonly activeChannel = this.activeChannelSignal.asReadonly();
  readonly channels = this.channelsSignal.asReadonly();

  // Update the active channel
  selectChannel(channel: Channel | null) {
    this.activeChannelSignal.set(channel);
  }

  // Load all channels into the reactive signal
  async loadChannels(): Promise<Channel[]> {
    const fetched = await this.getChannels();
    this.channelsSignal.set(fetched);
    return fetched;
  }

  // Fetch all channels from Supabase that the current user is a member of
  async getChannels(): Promise<Channel[]> {
    const { data: { user }, error: userError } = await this.supabaseSvc.supabase.auth.getUser();
    if (userError || !user) {
      console.warn('No authenticated user found while fetching channels');
      return [];
    }

    const { data: memberData, error: memberError } = await this.supabaseSvc.supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);

    if (memberError) {
      console.error('Error fetching channel memberships:', memberError.message);
      return [];
    }

    if (!memberData || memberData.length === 0) {
      return [];
    }

    const channelIds = memberData.map(item => item.channel_id);

    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .select('*')
      .in('id', channelIds);

    if (error) {
      console.error('Error fetching channels:', error.message);
      return [];
    }
    return data as Channel[];
  }

  // Insert new channel
  async createChannel(channel: Channel): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .insert({
        name: channel.name,
        description: channel.description,
        created_by: channel.created_by
      })
      .select();

    if (error) {
      console.error('Error creating channel:', error.message);
      throw error;
    }

    const active = data?.[0];
    if (active && active.id && channel.created_by) {
      await this.addMembersToChannel(active.id, [channel.created_by]);
    }
    
    // Reload channels to update the signal
    await this.loadChannels();
    return data;
  }

  // Update channel properties in database and local signals
  async updateChannel(id: string, updates: Partial<Channel>): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating channel:', error.message);
      throw error;
    }

    // Update the local channels signal array in place
    this.channelsSignal.set(
      this.channelsSignal().map(c => c.id === id ? { ...c, ...updates } : c)
    );

    // Update the active channel signal if it was the updated channel
    const active = this.activeChannel();
    if (active && active.id === id) {
      this.activeChannelSignal.set({ ...active, ...updates });
    }

    return data;
  }

  // Delete a channel from Supabase and update local signals
  async deleteChannel(id: string): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error deleting channel:', error.message);
      throw error;
    }

    // Filter out the deleted channel from local list signal
    this.channelsSignal.set(
      this.channelsSignal().filter(c => c.id !== id)
    );

    // If the deleted channel was active, switch to first remaining or null
    const active = this.activeChannel();
    if (active && active.id === id) {
      const remaining = this.channels();
      this.activeChannelSignal.set(remaining.length > 0 ? remaining[0] : null);
    }

    return data;
  }

  // Add multiple members to a channel, filtering out existing ones to prevent duplicates
  async addMembersToChannel(channelId: string, userIds: string[]): Promise<any> {
    if (userIds.length === 0) return [];

    const { data: existing, error: fetchError } = await this.supabaseSvc.supabase
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channelId);

    if (fetchError) {
      console.error('Error fetching existing channel members:', fetchError.message);
      throw fetchError;
    }

    const existingUserIds = new Set((existing || []).map(row => row.user_id));
    const newUserIds = userIds.filter(id => !existingUserIds.has(id));

    if (newUserIds.length === 0) {
      return [];
    }

    const rows = newUserIds.map(userId => ({
      channel_id: channelId,
      user_id: userId
    }));

    const { data, error } = await this.supabaseSvc.supabase
      .from('channel_members')
      .insert(rows)
      .select();

    if (error) {
      console.error('Error adding members to channel:', error.message);
      throw error;
    }
    return data;
  }

  // Remove a member from a channel
  async removeMemberFromChannel(channelId: string, userId: string): Promise<any> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channel_members')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error removing member from channel:', error.message);
      throw error;
    }
    return data;
  }

  // Get all members of a specific channel
  async getChannelMembers(channelId: string): Promise<User[]> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channel_members')
      .select('profiles(*)')
      .eq('channel_id', channelId);

    if (error) {
      console.error('Error fetching channel members:', error.message);
      return [];
    }

    const membersList = (data as any[]) || [];
    return membersList
      .map(item => item.profiles)
      .filter((p): p is User => p !== null && p !== undefined);
  }
}