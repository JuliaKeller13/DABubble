import { Injectable, inject } from '@angular/core';
import { supabaseService } from './supabase.service';
import { Channel } from '../interfaces/channel.interface';

@Injectable({
  providedIn: 'root'
})
export class channelService {
  private supabaseSvc = inject(supabaseService);

  // Fetch all channels
  async getChannels(): Promise<Channel[]> {
    const { data, error } = await this.supabaseSvc.supabase
      .from('channels')
      .select('*');

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
    return data;
  }
}