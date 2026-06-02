import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthResponse, User, RealtimeChannel } from '@supabase/supabase-js';
import { User as UserProfile } from '../interfaces/user.interface';

type ProfileUpsertPayload = {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string;
  status: UserProfile['status'];
};

type SupabaseIdentityData = {
  avatar_url?: unknown;
  picture?: unknown;
  picture_url?: unknown;
  photoURL?: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private supabaseSvc = inject(supabaseService);
  private currentUserSignal = signal<User | null>(null);
  private currentUserProfileSignal = signal<UserProfile | null>(null);
  private presenceChannel: RealtimeChannel | null = null;
  private onlineUserIdsSignal = signal<Set<string>>(new Set());

  readonly onlineUserIds = this.onlineUserIdsSignal.asReadonly();
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly currentUserProfile = this.currentUserProfileSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  constructor() {
    this.supabaseSvc.supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Authentication session error. Clearing state:', error.message);
          this.supabaseSvc.supabase.auth.signOut();
          this.clearAuthUrlHash();
        } else {
          this.handleUserChange(data.session?.user ?? null);
        }
      })
      .catch((err) => {
        console.error('Failed to get session:', err);
        this.supabaseSvc.supabase.auth.signOut();
        this.clearAuthUrlHash();
      });

    this.supabaseSvc.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.clearAuthUrlHash();
      }
      this.handleUserChange(session?.user ?? null);
    });
  }

  private clearAuthUrlHash() {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('access_token') || hash.includes('error') || hash.includes('refresh_token')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }

  private handleUserChange(user: User | null) {
    this.currentUserSignal.set(user);
    this.loadUserProfile(user);
  }

  private async loadUserProfile(user: User | null) {
    if (!user) {
      await this.cleanupPresence();
      return this.currentUserProfileSignal.set(null);
    }

    await this.ensureUserProfile(user);

    const { data, error } = await this.supabaseSvc.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        const displayName = user.user_metadata?.['full_name'] || user.user_metadata?.['name'] || user.email?.split('@')[0] || 'Neuer User';
        const avatarUrl = user.user_metadata?.['avatar_url'] || null;

        const { data: newProfile, error: createError } = await this.supabaseSvc.supabase
          .from('profiles')
          .insert({
            id: user.id,
            display_name: displayName,
            email: user.email || '',
            avatar_url: avatarUrl,
            status: 'online'
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating profile after login:', createError);
          await this.cleanupPresence();
          return this.currentUserProfileSignal.set(null);
        }

        this.currentUserProfileSignal.set(newProfile as UserProfile);
        await this.setupPresence(user);
        return;
      }

      console.error('Error loading profile:', error);
      await this.cleanupPresence();
      return this.currentUserProfileSignal.set(null);
    }

    this.currentUserProfileSignal.set(data as UserProfile);

    await this.setupPresence(user);
  }

  private async ensureUserProfile(user: User): Promise<void> {
    const metadata = user.user_metadata ?? {};
    const displayName = this.getDisplayName(metadata);
    const email = user.email ?? metadata['email'];

    if (!displayName || !email) return;

    const { data: existing, error: fetchError } = await this.supabaseSvc.supabase
      .from('profiles')
      .select('id, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking profile:', fetchError);
      return;
    }

    if (!existing) {
      const { error } = await this.supabaseSvc.supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: displayName,
          email,
          avatar_url: this.getAvatarUrl(user),
          status: 'online',
        });
      if (error) console.error('Error creating profile:', error);
    } else {
      const updates: Partial<ProfileUpsertPayload> = {
        display_name: displayName,
        email,
        status: 'online',
      };
      if (!existing['avatar_url']) {
        updates['avatar_url'] = this.getAvatarUrl(user);
      }
      const { error } = await this.supabaseSvc.supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (error) console.error('Error updating profile:', error);
    }
  }

  private getDisplayName(metadata: User['user_metadata']): string {
    const name = metadata['full_name'] ?? metadata['name'] ?? metadata['display_name'];
    return typeof name === 'string' ? name.trim() : '';
  }

  private getAvatarUrl(user: User): string {
    const metadata = user.user_metadata ?? {};
    const identities = Array.isArray(user.identities) ? user.identities : [];
    const avatarUrl =
      metadata['avatar_url'] ??
      metadata['picture'] ??
      metadata['picture_url'] ??
      identities
        .map((identity) => identity?.identity_data as SupabaseIdentityData | undefined)
        .flatMap((identityData) => [
          identityData?.avatar_url,
          identityData?.picture,
          identityData?.picture_url,
          identityData?.photoURL,
        ])
        .find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);

    return typeof avatarUrl === 'string' ? avatarUrl : '';
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    return await this.supabaseSvc.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  // Logs in as a guest user using pre-configured credentials
  async guestLogin(): Promise<AuthResponse> {
    const guestEmail = 'gast@dabubble.de';
    const guestPassword = 'Guest248635719/';
    return await this.loginWithEmail(guestEmail, guestPassword);
  }

  // Starts OAuth login flow using Google provider
  async loginWithGoogle(redirectTo?: string): Promise<any> {
    return await this.supabaseSvc.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || window.location.origin + '/main',
      },
    });
  }

  async signup(name: string, email: string, password: string, avatarUrl: string): Promise<{ error: any; data: any }> {
    const { data, error } = await this.supabaseSvc.supabase.auth.signUp({ email, password });
    if (error || !data.user) return { error, data };
    const { error: profileError } = await this.supabaseSvc.supabase
      .from('profiles')
      .upsert({ id: data.user.id, display_name: name, email, avatar_url: avatarUrl, status: 'online' });
    return { error: error || profileError, data };
  }

  // Logs out the current user and clears presence state
  async logout(): Promise<void> {
    await this.cleanupPresence();
    await this.supabaseSvc.supabase.auth.signOut();
  }

  private async setupPresence(user: User) {
    await this.cleanupPresence();

    const channel = this.supabaseSvc.supabase.channel('online-users');
    this.presenceChannel = channel;

    channel.on('presence', { event: 'sync' }, () => {
      if (!this.presenceChannel) return;
      const state = channel.presenceState();
      const onlineIds = new Set<string>();

      Object.values(state).forEach((presences: any) => {
        presences.forEach((p: any) => {
          if (p.userId) {
            onlineIds.add(p.userId);
          }
        });
      });

      this.onlineUserIdsSignal.set(onlineIds);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.presenceChannel === channel) {
        await channel.track({
          userId: user.id,
        });
      }
    });
  }

  private async cleanupPresence() {
    if (this.presenceChannel) {
      await this.supabaseSvc.supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
      this.onlineUserIdsSignal.set(new Set());
    }
  }
}
