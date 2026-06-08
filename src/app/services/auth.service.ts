import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthError, AuthResponse, OAuthResponse, PostgrestError, User } from '@supabase/supabase-js';
import { User as UserProfile } from '../interfaces/user.interface';
import { channelService } from './channel.service';
import { userService } from './user.service';
import { PresenceService } from './presence.service';
import { avatarService } from './avatar.service';

type SupabaseIdentityData = {
  avatar_url?: unknown;
  picture?: unknown;
  picture_url?: unknown;
  photoURL?: unknown;
};

type authServiceResult = { error: AuthError | null };
type SignupResult = { data: AuthResponse['data']; error: AuthError | PostgrestError | null };

@Injectable({
  providedIn: 'root',
})
export class authService {
  private supabaseSvc = inject(supabaseService);
  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private presenceSvc = inject(PresenceService);
  private avatarSvc = inject(avatarService);

  private currentUserSignal = signal<User | null>(null);
  private currentUserProfileSignal = signal<UserProfile | null>(null);
  private isInitializedSignal = signal(false);
  private passwordVisibilitySignal = signal<Record<string, boolean>>({});

  readonly onlineUserIds = this.presenceSvc.onlineUserIds;
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly currentUserProfile = this.currentUserProfileSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly isInitialized = this.isInitializedSignal.asReadonly();

  showPassword(field = 'password'): boolean {
    return this.passwordVisibilitySignal()[field] ?? false;
  }

  togglePassword(field = 'password'): void {
    this.passwordVisibilitySignal.update((v) => ({ ...v, [field]: !(v[field] ?? false) }));
  }

  resetPasswordVisibility(...fields: string[]): void {
    if (fields.length === 0) { this.passwordVisibilitySignal.set({}); return; }
    this.passwordVisibilitySignal.update((v) => {
      const next = { ...v };
      fields.forEach((f) => delete next[f]);
      return next;
    });
  }

  constructor() {
    this.initSession();
    this.initAuthStateChange();
  }

  private initSession(): void {
    this.supabaseSvc.supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) this.handleSessionError(error.message);
        else {
          if (data.session) this.clearAuthUrlHash();
          this.handleUserChange(data.session?.user ?? null);
        }
      })
      .catch((err) => { console.error('Failed to get session:', err); this.handleSessionError(''); })
      .finally(() => this.isInitializedSignal.set(true));
  }

  private handleSessionError(msg: string): void {
    if (msg) console.warn('Authentication session error. Clearing state:', msg);
    this.clearStaleTokens();
    this.supabaseSvc.supabase.auth.signOut();
    this.clearAuthUrlHash();
  }

  private initAuthStateChange(): void {
    this.supabaseSvc.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('Token refresh failed (no session returned). Signing out.');
        this.clearStaleTokens();
        this.supabaseSvc.supabase.auth.signOut();
        return;
      }
      if (event === 'SIGNED_OUT' || session) this.clearAuthUrlHash();
      this.handleUserChange(session?.user ?? null);
    });
  }

  private clearStaleTokens(): void {
    if (typeof window === 'undefined') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-')) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  private clearAuthUrlHash(): void {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('error') || hash.includes('refresh_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  private handleUserChange(user: User | null): void {
    this.currentUserSignal.set(user);
    this.loadUserProfile(user);
  }

  private async loadUserProfile(user: User | null): Promise<void> {
    if (!user) { await this.clearUserState(); return; }
    const profileData = await this.syncProfileWithDatabase(user);
    if (profileData) {
      this.currentUserProfileSignal.set(profileData);
      await this.presenceSvc.setup(user);
    }
  }

  private async clearUserState(): Promise<void> {
    await this.presenceSvc.cleanup();
    this.currentUserProfileSignal.set(null);
    this.channelSvc.selectChannel(null);
    this.userSvc.selectDirectChatUser(null);
  }

  private async syncProfileWithDatabase(user: User): Promise<UserProfile | null> {
    const displayName = this.getProfileDisplayName(user);
    const email = this.getProfileEmail(user);
    const avatarUrl = this.getAvatarUrl(user) || null;
    const { data: existing, error: fetchError } = await this.supabaseSvc.supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (fetchError) { console.error('Error loading profile:', fetchError); return null; }
    if (!existing) return this.createProfile(user.id, displayName, email, avatarUrl);
    return this.syncExistingProfile(user.id, existing as UserProfile, displayName, avatarUrl);
  }

  private syncExistingProfile(
    userId: string, existing: UserProfile, displayName: string, avatarUrl: string | null,
  ): UserProfile {
    const storedAvatar = typeof existing.avatar_url === 'string' ? this.avatarSvc.normalizeAvatarUrl(existing.avatar_url) : null;
    const nextAvatarUrl = avatarUrl || storedAvatar || existing.avatar_url || null;
    const profilePatch = { status: 'online', display_name: displayName, ...(nextAvatarUrl !== (existing.avatar_url || null) ? { avatar_url: nextAvatarUrl } : {}) };
    this.supabaseSvc.supabase.from('profiles').update(profilePatch).eq('id', userId).then(() => {});
    return { ...existing, ...profilePatch } as UserProfile;
  }

  private async createProfile(
    id: string, displayName: string, email: string, avatarUrl: string | null,
  ): Promise<UserProfile | null> {
    const { data: newProfile, error } = await this.supabaseSvc.supabase
      .from('profiles')
      .insert({ id, display_name: displayName, email, avatar_url: avatarUrl, status: 'online' })
      .select().single();
    if (error) { console.error('Error creating profile:', error); return null; }
    this.userSvc.clearCache();
    return newProfile as UserProfile;
  }

  private getProfileDisplayName(user: User): string {
    const metadata = user.user_metadata ?? {};
    const name = metadata['full_name'] ?? metadata['name'] ?? metadata['display_name'];
    if (typeof name === 'string' && name.trim()) return name.trim();
    if (user.email) return user.email.split('@')[0] ?? 'Neuer User';
    if (user.is_anonymous) return 'Gast';
    return 'Neuer User';
  }

  private getProfileEmail(user: User): string {
    const metadata = user.user_metadata ?? {};
    if (user.email) return user.email;
    const metadataEmail = metadata['email'];
    if (typeof metadataEmail === 'string' && metadataEmail.trim()) return metadataEmail.trim();
    if (user.is_anonymous) return `guest-${user.id}@guest.dabubble.local`;
    return '';
  }

  private getAvatarUrl(user: User): string {
    const metadata = user.user_metadata ?? {};
    const identities = Array.isArray(user.identities) ? user.identities : [];
    const avatarUrl =
      metadata['avatar_url'] ?? metadata['picture'] ?? metadata['picture_url'] ??
      identities
        .map((i) => i?.identity_data as SupabaseIdentityData | undefined)
        .flatMap((d) => [d?.avatar_url, d?.picture, d?.picture_url, d?.photoURL])
        .find((c) => typeof c === 'string' && c.trim().length > 0);
    return typeof avatarUrl === 'string' ? this.avatarSvc.normalizeAvatarUrl(avatarUrl) : '';
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    return this.supabaseSvc.supabase.auth.signInWithPassword({ email: email.trim(), password });
  }

  async requestPasswordReset(email: string): Promise<authServiceResult> {
    const redirectTo = typeof window === 'undefined'
      ? undefined : new URL('password-reset', document.baseURI).href;
    const { error } = await this.supabaseSvc.supabase.auth.resetPasswordForEmail(
      email.trim(), redirectTo ? { redirectTo } : undefined,
    );
    return { error };
  }

  async updatePassword(password: string): Promise<authServiceResult> {
    const { error } = await this.supabaseSvc.supabase.auth.updateUser({ password });
    return { error };
  }

  async updateCurrentUserProfile(displayName: string, avatarUrl: string): Promise<UserProfile | null> {
    const cp = this.currentUserProfile();
    const tName = displayName.trim();
    const tAvatar = this.avatarSvc.normalizeAvatarUrl(avatarUrl.trim());
    if (!this.currentUser() || !cp || !tName || !tAvatar) return null;
    const { error: ae } = await this.supabaseSvc.supabase.auth.updateUser({ data: { display_name: tName, full_name: tName, avatar_url: tAvatar } });
    if (ae) return console.error('Error updating auth user metadata:', ae), null;
    const { data: up, error: pe } = await this.supabaseSvc.supabase.from('profiles').update({ display_name: tName, avatar_url: tAvatar }).eq('id', cp.id).select().single();
    if (pe) return console.error('Error updating profile:', pe), null;
    this.userSvc.clearCache();
    const merged = { ...cp, ...up } as UserProfile;
    this.currentUserProfileSignal.set(merged);
    return merged;
  }

  async guestLogin(): Promise<AuthResponse> {
    const { data: { session }, error: sessionError } = await this.supabaseSvc.supabase.auth.getSession();
    if (session) {
      return { data: { user: session.user, session }, error: sessionError ?? null } as AuthResponse;
    }
    return this.supabaseSvc.supabase.auth.signInAnonymously({ options: { data: { display_name: 'Gast' } } });
  }

  async loginWithGoogle(redirectTo?: string): Promise<OAuthResponse> {
    return this.supabaseSvc.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo || new URL('main', document.baseURI).href },
    });
  }

  async signup(name: string, email: string, password: string, avatarUrl: string): Promise<SignupResult> {
    const trimmedEmail = email.trim();
    const { data, error } = await this.supabaseSvc.supabase.auth.signUp({
      email: trimmedEmail, password,
      options: { data: { display_name: name, full_name: name } },
    });
    if (error || !data.user) return { error, data };
    const { error: profileError } = await this.supabaseSvc.supabase
      .from('profiles')
      .upsert({ id: data.user.id, display_name: name, email: trimmedEmail, avatar_url: avatarUrl, status: 'online' });
    this.userSvc.clearCache();
    return { error: error || profileError, data };
  }

  async logout(): Promise<void> {
    await this.presenceSvc.cleanup();
    await this.supabaseSvc.supabase.auth.signOut();
  }

  async deleteCurrentUserAccount(): Promise<boolean> {
    const currentUser = this.currentUser();
    if (!currentUser) return false;
    const { error } = await this.supabaseSvc.supabase.functions.invoke('delete-account');
    if (error) { console.error('Error deleting current user account:', error); return false; }
    await this.clearUserState();
    this.currentUserSignal.set(null);
    const { error: signOutError } = await this.supabaseSvc.supabase.auth.signOut();
    if (signOutError) console.warn('Account deleted, but local sign-out reported an error:', signOutError);
    return true;
  }
}
