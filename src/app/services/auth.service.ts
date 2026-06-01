import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthResponse, User, RealtimeChannel } from '@supabase/supabase-js';
import { User as UserProfile } from '../interfaces/user.interface';

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
    this.supabaseSvc.supabase.auth.getSession().then(({ data }) => {
      this.handleUserChange(data.session?.user ?? null);
    });
    this.supabaseSvc.supabase.auth.onAuthStateChange((_event, session) => {
      this.handleUserChange(session?.user ?? null);
    });
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

    const { data, error } = await this.supabaseSvc.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error loading profile:', error);
      await this.cleanupPresence();
      return this.currentUserProfileSignal.set(null);
    }

    this.currentUserProfileSignal.set(data as UserProfile);

    this.setupPresence(user);
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    return await this.supabaseSvc.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  async guestLogin(): Promise<AuthResponse> {
    const guestEmail = 'gast@dabubble.de';
    const guestPassword = 'Guest248635719/';
    return await this.loginWithEmail(guestEmail, guestPassword);
  }

  async loginWithGoogle(redirectTo?: string): Promise<any> {
    return await this.supabaseSvc.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || window.location.origin + '/main',
      },
    });
  }

  async signup(name: string, email: string, password: string): Promise<{ error: any; data: any }> {
    const { data, error } = await this.supabaseSvc.supabase.auth.signUp({ email, password });
    if (error || !data.user) return { error, data };
    const { error: profileError } = await this.supabaseSvc.supabase
      .from('profiles')
      .upsert({ id: data.user.id, display_name: name, email });
    return { error: error || profileError, data };
  }

  async logout(): Promise<void> {
    await this.cleanupPresence();
    await this.supabaseSvc.supabase.auth.signOut();
  }

  private setupPresence(user: User) {
    this.cleanupPresence();

    this.presenceChannel = this.supabaseSvc.supabase.channel('online-users');

    this.presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = this.presenceChannel!.presenceState();
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

    this.presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.presenceChannel!.track({
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
