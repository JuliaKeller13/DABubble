import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { RealtimeChannel, User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class PresenceService {
  private supabaseSvc = inject(supabaseService);
  private presenceChannel: RealtimeChannel | null = null;
  private onlineUserIdsSignal = signal<Set<string>>(new Set());

  readonly onlineUserIds = this.onlineUserIdsSignal.asReadonly();

  async setup(user: User): Promise<void> {
    await this.cleanup();
    this.presenceChannel = this.supabaseSvc.supabase.channel('online-users');
    this.listenToPresenceSync(this.presenceChannel);
    this.subscribeAndTrack(this.presenceChannel, user.id);
  }

  async cleanup(): Promise<void> {
    if (!this.presenceChannel) return;
    await this.supabaseSvc.supabase.removeChannel(this.presenceChannel);
    this.presenceChannel = null;
    this.onlineUserIdsSignal.set(new Set());
  }

  private listenToPresenceSync(channel: RealtimeChannel): void {
    channel.on('presence', { event: 'sync' }, () => {
      if (this.presenceChannel !== channel) return;
      const state = channel.presenceState();
      const onlineIds = this.extractOnlineIds(state);
      this.onlineUserIdsSignal.set(onlineIds);
    });
  }

  private extractOnlineIds(state: Record<string, any[]>): Set<string> {
    const onlineIds = new Set<string>();
    Object.values(state).forEach((presences) => {
      presences.forEach((p) => {
        if (p['userId']) onlineIds.add(p['userId'] as string);
      });
    });
    return onlineIds;
  }

  private subscribeAndTrack(channel: RealtimeChannel, userId: string): void {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.presenceChannel === channel) {
        const trackStatus = await channel.track({ userId });
        if (trackStatus !== 'ok') console.error('Failed to track presence status');
      }
    });
  }
}
