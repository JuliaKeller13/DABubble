import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { RealtimeChannel, User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
/**
 * Service responsible for tracking and managing the online/presence status of users
 * using Supabase Realtime Presence.
 */
export class PresenceService {
  /**
   * The injected Supabase service instance.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * The current active Supabase realtime presence channel.
   */
  private presenceChannel: RealtimeChannel | null = null;

  /**
   * Internal signal storing the set of online user IDs.
   */
  private onlineUserIdsSignal = signal<Set<string>>(new Set());

  /**
   * Read-only signal exposing the set of online user IDs.
   */
  readonly onlineUserIds = this.onlineUserIdsSignal.asReadonly();

  /**
   * Sets up presence tracking for a user by cleaning up any existing channel,
   * initializing a new channel, and subscribing/tracking the user.
   *
   * @param user - The authenticated user whose presence is to be tracked.
   * @returns A promise that resolves when the setup is complete.
   */
  async setup(user: User): Promise<void> {
    await this.cleanup();
    this.presenceChannel = this.supabaseSvc.supabase.channel('online-users');
    this.listenToPresenceSync(this.presenceChannel);
    this.subscribeAndTrack(this.presenceChannel, user.id);
  }

  /**
   * Cleans up the active presence channel by unsubscribing, removing the channel,
   * resetting the channel reference, and clearing the online users signal.
   *
   * @returns A promise that resolves when the cleanup is complete.
   */
  async cleanup(): Promise<void> {
    if (!this.presenceChannel) return;
    await this.supabaseSvc.supabase.removeChannel(this.presenceChannel);
    this.presenceChannel = null;
    this.onlineUserIdsSignal.set(new Set());
  }

  /**
   * Listens to the presence 'sync' event on the channel and updates the online user IDs list.
   *
   * @param channel - The Supabase RealtimeChannel to listen on.
   */
  private listenToPresenceSync(channel: RealtimeChannel): void {
    channel.on('presence', { event: 'sync' }, () => {
      if (this.presenceChannel !== channel) return;
      const state = channel.presenceState();
      const onlineIds = this.extractOnlineIds(state);
      this.onlineUserIdsSignal.set(onlineIds);
    });
  }

  /**
   * Extracts and collects user IDs from the presence state dictionary.
   *
   * @param state - The dictionary containing current presence statuses of channel members.
   * @returns A set of user IDs currently marked as online.
   */
  private extractOnlineIds(state: Record<string, any[]>): Set<string> {
    const onlineIds = new Set<string>();
    Object.values(state).forEach((presences) => {
      presences.forEach((p) => {
        if (p['userId']) onlineIds.add(p['userId'] as string);
      });
    });
    return onlineIds;
  }

  /**
   * Subscribes to the channel and registers the user's ID to track their presence.
   *
   * @param channel - The Supabase RealtimeChannel to subscribe to.
   * @param userId - The ID of the user to track.
   */
  private subscribeAndTrack(channel: RealtimeChannel, userId: string): void {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.presenceChannel === channel) {
        const trackStatus = await channel.track({ userId });
        if (trackStatus !== 'ok') console.error('Failed to track presence status');
      }
    });
  }
}
