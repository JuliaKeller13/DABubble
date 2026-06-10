import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { User } from '../interfaces/user.interface';
import { avatarService } from './avatar.service';

/**
 * Service to manage user profiles, select active direct message partners,
 * cache user details, and normalize avatar URLs.
 */
@Injectable({
    providedIn: 'root'
})
export class userService {
    /**
     * Supabase service instance injected for handling database operations.
     */
    private supabaseSvc = inject(supabaseService);

    /**
     * Avatar service instance injected for normalizing avatar URLs.
     */
    private avatarSvc = inject(avatarService);

    /**
     * Signal representing the currently selected user for direct chat.
     */
    private activeDirectChatUserSignal = signal<User | null>(null);

    /**
     * Read-only signal containing the active direct chat user.
     */
    readonly activeDirectChatUser = this.activeDirectChatUserSignal.asReadonly();
    
    /**
     * Map cache containing loaded users mapped by their unique IDs.
     */
    private usersCache = new Map<string, User>();

    /**
     * Cache array holding all loaded users.
     */
    private usersListCache: User[] | null = null;

    /**
     * Active loading promise to coalesce multiple concurrent fetch requests for users.
     */
    private usersListPromise: Promise<User[]> | null = null;

    /**
     * Clears all cached user lists and active loading promises.
     */
    clearCache() {
        this.usersListCache = null;
        this.usersListPromise = null;
    }

    /**
     * Resets all cached user lists, maps, active promises, and signals.
     */
    clearState() {
        this.usersCache.clear();
        this.usersListCache = null;
        this.usersListPromise = null;
        this.activeDirectChatUserSignal.set(null);
    }

    /**
     * Filters out duplicate guest users in a list, ensuring guest details do not clutter the interface.
     * Keeps the current guest user and guests who have active conversations with the current user.
     * 
     * @param users - An array of User objects to filter.
     * @param currentUserId - The current user's ID.
     * @param activePartnerIds - Optional array of active DM partner user IDs.
     * @returns A filtered array of User objects.
     */
    filterDuplicateGuests(users: User[], currentUserId: string | null, activePartnerIds?: string[]): User[] {
        const filtered = users.filter((u) => u.id !== 'dabubble-team-local-id' && u.display_name !== 'DABubble-Team');
        const guests = filtered.filter((u) => u.display_name === 'Gast');
        if (guests.length <= 1) return filtered;
        const currentGuest = currentUserId ? guests.find((u) => u.id === currentUserId) : null;
        const guestToShow = currentGuest || guests[0];
        return filtered.filter((u) => {
            if (u.display_name !== 'Gast') return true;
            if (u.id === guestToShow.id) return true;
            if (activePartnerIds && activePartnerIds.includes(u.id)) return true;
            return false;
        });
    }

    /**
     * Selects a user for the active direct chat panel.
     * 
     * @param user - The User object to select, or null to clear selection.
     */
    selectDirectChatUser(user: User | null) {
        this.activeDirectChatUserSignal.set(user);
    }

    /**
     * Normalizes the user's avatar URL using `avatarService`.
     * 
     * @param user - The raw User object.
     * @returns The User object with a normalized avatar URL.
     */
    private normalizeUser(user: User): User {
        const normalizedAvatar = this.avatarSvc.normalizeAvatarUrl(user.avatar_url || '');
        return { ...user, avatar_url: normalizedAvatar || user.avatar_url };
    }

    /**
     * Upserts a user profile in the database and updates caches.
     * 
     * @param user - The User object containing profile details.
     * @returns A promise resolving to the database upsert operation response.
     */
    async upsertProfile(user: User): Promise<any> {
        const normalizedUser = this.normalizeUser(user);
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .upsert({ id: normalizedUser.id, display_name: normalizedUser.display_name, email: normalizedUser.email, avatar_url: normalizedUser.avatar_url, status: normalizedUser.status });
        if (error) {
            console.error('Fehler beim Speichern des Profils:', error.message);
            throw error;
        }
        this.usersCache.set(normalizedUser.id, normalizedUser);
        this.usersListCache = null;
        return data;
    }

    /**
     * Loads all users, using cached data if available and not forced to refresh.
     * 
     * @param forceRefresh - If true, clears the cache and requests fresh data from the database.
     * @returns A promise resolving to the array of User objects.
     */
    async getAllUsers(forceRefresh = false): Promise<User[]> {
        if (forceRefresh) this.clearCache();
        if (this.usersListCache) return this.usersListCache;
        if (this.usersListPromise) return this.usersListPromise;
        this.usersListPromise = this.fetchAllUsers().finally(() => this.usersListPromise = null);
        return this.usersListPromise;
    }

    /**
     * Fetches all user profiles from the database, normalizes their avatar URLs, and caches them.
     * 
     * @returns A promise resolving to the fetched array of User objects.
     */
    private async fetchAllUsers(): Promise<User[]> {
        const { data, error } = await this.supabaseSvc.supabase.from('profiles').select('*');
        if (error) return console.error('Fehler beim Laden der User:', error.message), [];
        const users = (data as User[]).map((user) => this.normalizeUser(user));
        users.forEach((u) => this.usersCache.set(u.id, u));
        this.usersListCache = users;
        return users;
    }

    /**
     * Constructs and returns the mock DABubble team profile.
     * 
     * @returns A User object representing the DABubble team.
     */
    private getLocalTeamUser(): User {
        return { id: 'dabubble-team-local-id', display_name: 'DABubble-Team', email: 'team@dabubble.local', avatar_url: 'img/logo/Logo.svg', status: 'online' };
    }

    /**
     * Retrieves a user by their unique ID.
     * Resolves from local cache if possible, otherwise queries the database.
     * Returns the local team user if ID matches `dabubble-team-local-id`.
     * 
     * @param id - The unique ID of the user.
     * @returns A promise resolving to the User object or null if not found.
     */
    async getUserById(id: string): Promise<User | null> {
        if (id === 'dabubble-team-local-id') return this.getLocalTeamUser();
        if (this.usersCache.has(id)) return this.usersCache.get(id) || null;
        const { data, error } = await this.supabaseSvc.supabase.from('profiles').select('*').eq('id', id).single();
        if (error) {
            console.error('Fehler beim Laden des Users:', error.message);
            return null;
        }
        const user = this.normalizeUser(data as User);
        this.usersCache.set(id, user);
        return user;
    }
}