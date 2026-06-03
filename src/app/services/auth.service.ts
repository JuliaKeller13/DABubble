import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthError, AuthResponse, OAuthResponse, PostgrestError, RealtimeChannel, User } from '@supabase/supabase-js';
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

type AuthServiceResult = {
  error: AuthError | null;
};

type SignupResult = {
  data: AuthResponse['data'];
  error: AuthError | PostgrestError | null;
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
          if (data.session) {
            this.clearAuthUrlHash();
          }
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
      } else if (session) {
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
      return this.clearUserState();
    }

    const profileData = await this.syncProfileWithDatabase(user);
    
    if (profileData) {
      this.currentUserProfileSignal.set(profileData);
      await this.setupPresence(user);
    }
  }

  private async clearUserState() {
    await this.cleanupPresence();
    this.currentUserProfileSignal.set(null);
  }

  private async syncProfileWithDatabase(user: User): Promise<UserProfile | null> {
    const displayName = this.getProfileDisplayName(user);
    const email = this.getProfileEmail(user);
    const avatarUrl = this.getAvatarUrl(user) || null;

    const { data: existingProfile, error: fetchError } = await this.supabaseSvc.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error loading profile:', fetchError);
      return null;
    }

    if (!existingProfile) {
      const { data: newProfile, error: createError } = await this.supabaseSvc.supabase
        .from('profiles')
        .insert({ id: user.id, display_name: displayName, email, avatar_url: avatarUrl, status: 'online' })
        .select()
        .single();

      if (createError) {
        console.error('Error creating profile:', createError);
        return null;
      }
      return newProfile as UserProfile;
    }

    await this.supabaseSvc.supabase
      .from('profiles')
      .update({ status: 'online', display_name: displayName })
      .eq('id', user.id);

    return { ...existingProfile, status: 'online', display_name: displayName } as UserProfile;
  }

  private getDisplayName(metadata: User['user_metadata']): string {
    const name = metadata['full_name'] ?? metadata['name'] ?? metadata['display_name'];
    return typeof name === 'string' ? name.trim() : '';
  }

  private getProfileDisplayName(user: User): string {
    const metadata = user.user_metadata ?? {};
    const displayName = this.getDisplayName(metadata);

    if (displayName) {
      return displayName;
    }

    if (user.email) {
      return user.email.split('@')[0] ?? 'Neuer User';
    }

    if (user.is_anonymous) {
      return 'Gast';
    }

    return 'Neuer User';
  }

  private getProfileEmail(user: User): string {
    const metadata = user.user_metadata ?? {};
    const metadataEmail = metadata['email'];

    if (user.email) {
      return user.email;
    }

    if (typeof metadataEmail === 'string' && metadataEmail.trim()) {
      return metadataEmail.trim();
    }

    if (user.is_anonymous) {
      return `guest-${user.id}@guest.dabubble.local`;
    }

    return '';
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

  async requestPasswordReset(email: string): Promise<AuthServiceResult> {
    const redirectTo = typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/password-reset`;

    const { error } = await this.supabaseSvc.supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );

    return { error };
  }

  async updatePassword(password: string): Promise<AuthServiceResult> {
    const { error } = await this.supabaseSvc.supabase.auth.updateUser({
      password,
    });

    return { error };
  }

  async guestLogin(): Promise<AuthResponse> {
    const { data: { session }, error: sessionError } = await this.supabaseSvc.supabase.auth.getSession();

    if (session) {
      console.log('User/Gast ist bereits eingeloggt, Session wird wiederverwendet.');
      return {
        data: { user: session.user, session },
        error: sessionError ?? null,
      } as AuthResponse;
    }

    return await this.supabaseSvc.supabase.auth.signInAnonymously({
      options: {
        data: {
          display_name: 'Gast',
        },
      },
    });
  }

  async loginWithGoogle(redirectTo?: string): Promise<OAuthResponse> {
    return await this.supabaseSvc.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || window.location.origin + '/main',
      },
    });
  }

  async signup(name: string, email: string, password: string, avatarUrl: string): Promise<SignupResult> {
    const { data, error } = await this.supabaseSvc.supabase.auth.signUp({ email, password });
    if (error || !data.user) return { error, data };
    const { error: profileError } = await this.supabaseSvc.supabase
      .from('profiles')
      .upsert({ id: data.user.id, display_name: name, email, avatar_url: avatarUrl, status: 'online' });
    return { error: error || profileError, data };
  }

  async logout(): Promise<void> {
    await this.cleanupPresence();
    await this.supabaseSvc.supabase.auth.signOut();
  }

  private async setupPresence(user: User) {
    await this.cleanupPresence();

    this.presenceChannel = this.supabaseSvc.supabase.channel('online-users');

    this.setupPresenceSyncListener(this.presenceChannel);
    this.subscribeAndTrackPresence(this.presenceChannel, user.id);
  }

  private setupPresenceSyncListener(channel: RealtimeChannel) {
    channel.on('presence', { event: 'sync' }, () => {
      if (this.presenceChannel !== channel) return; 
      
      const state = channel.presenceState();
      const onlineIds = this.extractOnlineUserIds(state);
      
      this.onlineUserIdsSignal.set(onlineIds);
    });
  }

  private extractOnlineUserIds(state: Record<string, any[]>): Set<string> {
    const onlineIds = new Set<string>();

    Object.values(state).forEach((presences) => {
      presences.forEach((presence) => {
        if (presence['userId']) {
          onlineIds.add(presence['userId'] as string);
        }
      });
    });

    return onlineIds;
  }

  private subscribeAndTrackPresence(channel: RealtimeChannel, userId: string) {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.presenceChannel === channel) {
        const trackStatus = await channel.track({ userId });
        
        if (trackStatus !== 'ok') {
          console.error('Failed to track presence status');
        }
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
