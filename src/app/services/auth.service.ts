import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthError, AuthResponse, OAuthResponse, PostgrestError, Session, User } from '@supabase/supabase-js';
import { User as UserProfile } from '../interfaces/user.interface';
import { channelService } from './channel.service';
import { userService } from './user.service';
import { PresenceService } from './presence.service';
import { avatarService } from './avatar.service';

/**
 * Helper type matching the structure of Supabase OAuth identity metadata.
 */
type SupabaseIdentityData = {
  avatar_url?: unknown;
  picture?: unknown;
  picture_url?: unknown;
  photoURL?: unknown;
};

/**
 * Result structure returned by password actions.
 */
type authServiceResult = { error: AuthError | null };

/**
 * Result structure returned by user signup actions.
 */
type SignupResult = { data: AuthResponse['data']; error: AuthError | PostgrestError | null };

@Injectable({
  providedIn: 'root',
})
/**
 * Service that manages user authentication, authorization, session states,
 * user profile syncing, anonymous login, and password management using Supabase Auth.
 */
export class authService {
  /**
   * The injected Supabase service instance.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * The injected channel service instance.
   */
  private channelSvc = inject(channelService);

  /**
   * The injected user service instance.
   */
  private userSvc = inject(userService);

  /**
   * The injected presence service instance.
   */
  private presenceSvc = inject(PresenceService);

  /**
   * The injected avatar service instance.
   */
  private avatarSvc = inject(avatarService);

  /**
   * Flag indicating if performance measuring is enabled via URL search parameter.
   */
  private readonly startupMeasureEnabled = typeof window !== 'undefined' && window.location.search.includes('measureAuth=1');

  /**
   * Start timestamp for initial session bootstrap performance tracking.
   */
  private readonly authBootstrapStart = this.markStart('initSession.bootstrap');

  /**
   * Profile load operation version counter used to discard stale load responses.
   */
  private profileLoadVersion = 0;

  /**
   * User ID currently undergoing a profile load sequence.
   */
  private profileLoadUserId: string | null = null;

  /**
   * Flag indicating if the initial session detection has been processed.
   */
  private initialSessionHandled = false;

  /**
   * Fallback timer reference used to fetch the session if the Supabase event doesn't fire.
   */
  private initialSessionFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Internal signal storing the current authenticated Supabase User object.
   */
  private currentUserSignal = signal<User | null>(null);

  /**
   * Internal signal storing the current user's profile information from the database.
   */
  private currentUserProfileSignal = signal<UserProfile | null>(null);

  /**
   * Internal signal indicating whether the auth service has completed initial session detection.
   */
  private isInitializedSignal = signal(false);

  /**
   * Internal signal tracking the visibility status of password input fields.
   */
  private passwordVisibilitySignal = signal<Record<string, boolean>>({});

  /**
   * Read-only signal exposing the set of online user IDs from the presence service.
   */
  readonly onlineUserIds = this.presenceSvc.onlineUserIds;

  /**
   * Read-only signal exposing the current authenticated Supabase User object.
   */
  readonly currentUser = this.currentUserSignal.asReadonly();

  /**
   * Read-only signal exposing the current user's profile information.
   */
  readonly currentUserProfile = this.currentUserProfileSignal.asReadonly();

  /**
   * Computed signal indicating whether a user is currently authenticated.
   */
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  /**
   * Read-only signal exposing the initialization state of the auth service.
   */
  readonly isInitialized = this.isInitializedSignal.asReadonly();

  /**
   * Checks if a password input field's value should be displayed in plain text.
   *
   * @param field - The key identifying the password input field.
   * @returns True if the field is visible (plain text), false otherwise.
   */
  showPassword(field = 'password'): boolean {
    return this.passwordVisibilitySignal()[field] ?? false;
  }

  /**
   * Toggles the visibility status of a password input field.
   *
   * @param field - The key identifying the password input field.
   */
  togglePassword(field = 'password'): void {
    this.passwordVisibilitySignal.update((v) => ({ ...v, [field]: !(v[field] ?? false) }));
  }

  /**
   * Resets the visibility status of specified password fields, or all if none are specified.
   *
   * @param fields - Optional list of password input field keys to reset.
   */
  resetPasswordVisibility(...fields: string[]): void {
    if (fields.length === 0) { this.passwordVisibilitySignal.set({}); return; }
    this.passwordVisibilitySignal.update((v) => {
      const next = { ...v };
      fields.forEach((f) => delete next[f]);
      return next;
    });
  }

  /**
   * Sets up auth state listeners and fallback mechanisms upon service instantiation.
   */
  constructor() {
    this.initAuthStateChange();
    this.initSessionFallback();
  }

  /**
   * Sets up a timer to query the session manually if the initial session event from Supabase is delayed.
   */
  private initSessionFallback(): void {
    this.initialSessionFallbackTimer = setTimeout(() => {
      if (this.initialSessionHandled) return;
      const initStart = this.markStart('initSession.getSessionFallback');
      this.supabaseSvc.supabase.auth.getSession()
        .then(({ data, error }) => {
          this.markEnd('initSession.getSessionFallback', initStart);
          if (this.initialSessionHandled) return;
          if (error) this.handleSessionError(error.message);
          else this.resolveInitialSession(data.session ?? null);
        })
        .catch((err) => {
          console.error('Failed to get session:', err);
          if (this.initialSessionHandled) return;
          this.handleSessionError('');
          this.resolveInitialSession(null);
        });
    }, 250);
  }

  /**
   * Handles session retrieval errors by cleaning up stale tokens and signing out.
   *
   * @param msg - The error description message.
   */
  private handleSessionError(msg: string): void {
    if (msg) console.warn('Authentication session error. Clearing state:', msg);
    this.clearStaleTokens();
    this.supabaseSvc.supabase.auth.signOut();
    this.clearAuthUrlHash();
  }

  /**
   * Registers a callback for Supabase auth state change events.
   */
  private initAuthStateChange(): void {
    this.supabaseSvc.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        this.resolveInitialSession(session);
        return;
      }
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('Token refresh failed (no session returned). Signing out.');
        this.clearStaleTokens();
        this.supabaseSvc.supabase.auth.signOut();
        return;
      }
      if (event === 'SIGNED_OUT' || session) this.clearAuthUrlHash();
      this.handleUserChange(session?.user ?? null);
      this.finishInitialization();
    });
  }

  /**
   * Resolves the initial auth session, clearing hash indicators and loading the user state.
   *
   * @param session - The initial session object from Supabase.
   */
  private resolveInitialSession(session: Session | null): void {
    if (this.initialSessionHandled) return;
    this.initialSessionHandled = true;
    this.markEnd('initSession.bootstrap', this.authBootstrapStart);
    if (session) this.clearAuthUrlHash();
    this.handleUserChange(session?.user ?? null);
    this.finishInitialization();
  }

  /**
   * Finalizes the service initialization by clearing fallback timers and setting initialized signals.
   */
  private finishInitialization(): void {
    if (this.initialSessionFallbackTimer !== null) {
      clearTimeout(this.initialSessionFallbackTimer);
      this.initialSessionFallbackTimer = null;
    }
    if (!this.isInitializedSignal()) this.isInitializedSignal.set(true);
  }

  /**
   * Clears Supabase-related authentication tokens from localStorage and sessionStorage.
   */
  private clearStaleTokens(): void {
    if (typeof window === 'undefined') return;
    const keysToRemoveLocal: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-')) keysToRemoveLocal.push(key);
    }
    keysToRemoveLocal.forEach((key) => localStorage.removeItem(key));

    const keysToRemoveSession: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('sb-')) keysToRemoveSession.push(key);
    }
    keysToRemoveSession.forEach((key) => sessionStorage.removeItem(key));
  }

  /**
   * Removes auth token fragments from the URL to keep the browser address clean.
   */
  private clearAuthUrlHash(): void {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('error') || hash.includes('refresh_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  /**
   * Responds to user authentication changes and initiates loading of user profile data.
   *
   * @param user - The updated user object.
   */
  private handleUserChange(user: User | null): void {
    const nextUserId = user?.id ?? null;
    const currentUserId = this.currentUserSignal()?.id ?? null;
    const profileUserId = this.currentUserProfileSignal()?.id ?? null;

    this.currentUserSignal.set(user);

    if (this.profileLoadUserId === nextUserId) return;
    if (currentUserId === nextUserId && profileUserId === nextUserId) return;

    void this.loadUserProfile(user, ++this.profileLoadVersion);
  }

  /**
   * Loads the profile details for the authenticated user and sets up presence tracking.
   *
   * @param user - The authenticated user whose profile needs to be loaded.
   * @param loadVersion - The tracking version of this load sequence.
   * @returns A promise that resolves when the profile is loaded.
   */
  private async loadUserProfile(user: User | null, loadVersion: number): Promise<void> {
    this.profileLoadUserId = user?.id ?? null;
    if (!user) {
      await this.clearUserState();
      if (this.profileLoadVersion === loadVersion) this.profileLoadUserId = null;
      return;
    }
    const loadStart = this.markStart('loadUserProfile.total');
    const profileData = await this.syncProfileWithDatabase(user);
    if (this.profileLoadVersion !== loadVersion || this.currentUserSignal()?.id !== user.id) return;
    if (profileData) {
      this.currentUserProfileSignal.set(profileData);
      const presenceStart = this.markStart('loadUserProfile.presenceSetup');
      await this.presenceSvc.setup(user);
      if (this.profileLoadVersion !== loadVersion || this.currentUserSignal()?.id !== user.id) return;
      this.markEnd('loadUserProfile.presenceSetup', presenceStart);
    }
    this.profileLoadUserId = user.id;
    this.markEnd('loadUserProfile.total', loadStart);
  }

  /**
   * Clears active user states, unsubscribes presence channels, and resets active selections.
   *
   * @returns A promise that resolves when the cleanups are completed.
   */
  private async clearUserState(): Promise<void> {
    await this.presenceSvc.cleanup();
    this.currentUserProfileSignal.set(null);
    this.channelSvc.clearState();
    this.userSvc.clearState();
  }

  /**
   * Synchronizes user metadata from authentication with the application profiles table.
   *
   * @param user - The Supabase user to synchronize.
   * @returns A promise resolving to the synced UserProfile object, or null.
   */
  private async syncProfileWithDatabase(user: User): Promise<UserProfile | null> {
    const syncStart = this.markStart('syncProfileWithDatabase.total');
    const displayName = this.getProfileDisplayName(user);
    const email = this.getProfileEmail(user);
    const avatarUrl = this.getAvatarUrl(user) || null;
    const fetchStart = this.markStart('syncProfileWithDatabase.fetchProfile');
    const { data: existing, error: fetchError } = await this.supabaseSvc.supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle();
    this.markEnd('syncProfileWithDatabase.fetchProfile', fetchStart);
    if (fetchError) { console.error('Error loading profile:', fetchError); return null; }
    
    let profile: UserProfile | null = null;
    if (!existing) {
      profile = await this.createProfile(user.id, displayName, email, avatarUrl);
    } else {
      profile = this.syncExistingProfile(user.id, existing as UserProfile, displayName, avatarUrl);
    }

    if (displayName === 'Gast' || (email && email.includes('guest-')) || user.is_anonymous) {
      await this.addGuestToEntwicklerteamChannel(user.id);
    }

    this.markEnd('syncProfileWithDatabase.total', syncStart);
    return profile;
  }

  /**
   * Registers the start time of a performance metric measurement.
   *
   * @param label - The metric label name.
   * @returns A performance timestamp.
   */
  private markStart(label: string): number {
    return this.startupMeasureEnabled && typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /**
   * Logs duration measurements if performance tracking is enabled.
   *
   * @param label - The metric label name.
   * @param start - The start timestamp of the measurement.
   */
  private markEnd(label: string, start: number): void {
    if (!this.startupMeasureEnabled || typeof performance === 'undefined' || !start) return;
    console.info(`[auth-startup] ${label}: ${Math.round(performance.now() - start)}ms`);
  }

  /**
   * Synchronizes an existing database profile with information retrieved from OAuth provider data.
   *
   * @param userId - The user ID.
   * @param existing - The existing UserProfile details.
   * @param displayName - The resolved display name.
   * @param avatarUrl - The resolved avatar image URL.
   * @returns The updated UserProfile object.
   */
  private syncExistingProfile(
    userId: string, existing: UserProfile, displayName: string, avatarUrl: string | null,
  ): UserProfile {
    const storedAvatar = typeof existing.avatar_url === 'string' ? this.avatarSvc.normalizeAvatarUrl(existing.avatar_url) : null;
    const nextAvatarUrl = avatarUrl || storedAvatar || existing.avatar_url || null;
    const profilePatch = { status: 'online', display_name: displayName, ...(nextAvatarUrl !== (existing.avatar_url || null) ? { avatar_url: nextAvatarUrl } : {}) };
    this.supabaseSvc.supabase.from('profiles').update(profilePatch).eq('id', userId).then(() => {});
    return { ...existing, ...profilePatch } as UserProfile;
  }

  /**
   * Creates a new user profile entry in the database.
   *
   * @param id - The user UUID.
   * @param displayName - The user's display name.
   * @param email - The user's email address.
   * @param avatarUrl - Optional avatar image URL path.
   * @returns A promise resolving to the created UserProfile or null.
   */
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

  /**
   * Automatically adds a guest user to the "Entwicklerteam" channel.
   *
   * @param userId - The guest user ID.
   */
  private async addGuestToEntwicklerteamChannel(userId: string): Promise<void> {
    try {
      // 1. Find the channel named "Entwicklerteam"
      const { data: channel, error: channelError } = await this.supabaseSvc.supabase
        .from('channels')
        .select('id')
        .eq('name', 'Entwicklerteam')
        .maybeSingle();
      if (channelError) {
        console.error('Error fetching Entwicklerteam channel for guest auto-join:', channelError);
        return;
      }
      if (!channel) {
        console.warn('Channel "Entwicklerteam" not found in the database.');
        return;
      }

      // 2. Check if the user is already a member of this channel
      const { data: existingMember, error: memError } = await this.supabaseSvc.supabase
        .from('channel_members')
        .select('channel_id')
        .eq('channel_id', channel.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (memError) {
        console.error('Error checking existing membership for guest in Entwicklerteam:', memError);
        return;
      }

      // 3. If not already a member, insert the membership
      if (!existingMember) {
        const { error: insertError } = await this.supabaseSvc.supabase
          .from('channel_members')
          .insert({
            channel_id: channel.id,
            user_id: userId,
          });
        if (insertError) {
          console.error('Error adding guest to Entwicklerteam:', insertError);
        } else {
          console.info(`Successfully added guest user ${userId} to channel Entwicklerteam`);
        }
      }
    } catch (e) {
      console.error('Exception in addGuestToEntwicklerteamChannel:', e);
    }
  }

  /**
   * Decides what display name to use based on metadata, email fallback, or guest settings.
   *
   * @param user - The Supabase user record.
   * @returns The resolved display name string.
   */
  private getProfileDisplayName(user: User): string {
    const metadata = user.user_metadata ?? {};
    const name = metadata['full_name'] ?? metadata['name'] ?? metadata['display_name'];
    if (typeof name === 'string' && name.trim()) return name.trim();
    if (user.email) return user.email.split('@')[0] ?? 'Neuer User';
    if (user.is_anonymous) return 'Gast';
    return 'Neuer User';
  }

  /**
   * Retrieves the email address from user details or returns a fallback for guests.
   *
   * @param user - The Supabase user record.
   * @returns The user's email address.
   */
  private getProfileEmail(user: User): string {
    const metadata = user.user_metadata ?? {};
    if (user.email) return user.email;
    const metadataEmail = metadata['email'];
    if (typeof metadataEmail === 'string' && metadataEmail.trim()) return metadataEmail.trim();
    if (user.is_anonymous) return `guest-${user.id}@guest.dabubble.local`;
    return '';
  }

  /**
   * Checks metadata and linked identities to determine the user's avatar URL.
   *
   * @param user - The Supabase user record.
   * @returns The normalized avatar image URL.
   */
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

  /**
   * Signs in a user using an email address and a password.
   *
   * @param email - The user's email address.
   * @param password - The password string.
   * @returns A promise that resolves to the login AuthResponse.
   */
  async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
    return this.supabaseSvc.supabase.auth.signInWithPassword({ email: email.trim(), password });
  }

  /**
   * Sends a password reset request email to the specified user email.
   *
   * @param email - The destination email address.
   * @returns A promise resolving to the service action result containing any errors.
   */
  async requestPasswordReset(email: string): Promise<authServiceResult> {
    const redirectTo = typeof window === 'undefined'
      ? undefined : new URL('password-reset', document.baseURI).href;
    const { error } = await this.supabaseSvc.supabase.auth.resetPasswordForEmail(
      email.trim(), redirectTo ? { redirectTo } : undefined,
    );
    return { error };
  }

  /**
   * Updates the password for the currently logged-in user.
   *
   * @param password - The new password string.
   * @returns A promise resolving to the service action result containing any errors.
   */
  async updatePassword(password: string): Promise<authServiceResult> {
    const { error } = await this.supabaseSvc.supabase.auth.updateUser({ password });
    return { error };
  }

  /**
   * Updates the current user's display name and avatar URL across auth metadata and the database.
   *
   * @param displayName - The new display name.
   * @param avatarUrl - The new avatar image path.
   * @returns A promise resolving to the updated UserProfile or null.
   */
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

  /**
   * Signs in a user anonymously as a guest, reusing an existing session if possible.
   *
   * @returns A promise that resolves to the sign-in AuthResponse.
   */
  async guestLogin(): Promise<AuthResponse> {
    const { data: { session }, error: sessionError } = await this.supabaseSvc.supabase.auth.getSession();
    if (session) {
      return { data: { user: session.user, session }, error: sessionError ?? null } as AuthResponse;
    }
    return this.supabaseSvc.supabase.auth.signInAnonymously({ options: { data: { display_name: 'Gast' } } });
  }

  /**
   * Signs in a user using Google OAuth authentication.
   *
   * @param redirectTo - Optional destination URL after successful authentication.
   * @returns A promise that resolves to the Google sign-in OAuthResponse.
   */
  async loginWithGoogle(redirectTo?: string): Promise<OAuthResponse> {
    return this.supabaseSvc.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo || new URL('main', document.baseURI).href },
    });
  }

  /**
   * Signs up a new user, registering them in Supabase Auth and creating their database profile record.
   *
   * @param name - The user display name.
   * @param email - The email address.
   * @param password - The user password.
   * @param avatarUrl - The chosen avatar image URL.
   * @returns A promise that resolves to the SignupResult.
   */
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

  /**
   * Logs out the current user, cleaning up their presence states and sessions.
   *
   * @returns A promise that resolves when the logout is complete.
   */
  async logout(): Promise<void> {
    await this.presenceSvc.cleanup();
    await this.supabaseSvc.supabase.auth.signOut();
  }

  /**
   * Deletes the currently authenticated user's account by invoking a Supabase Edge function and clearing state.
   *
   * @returns A promise that resolves to true if the account is successfully deleted, false otherwise.
   */
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
