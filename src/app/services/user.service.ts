import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { User } from '../interfaces/user.interface';
import { avatarService } from './avatar.service';

@Injectable({
    providedIn: 'root'
})
export class userService {
    private supabaseSvc = inject(supabaseService);
    private avatarSvc = inject(avatarService);
    private activeDirectChatUserSignal = signal<User | null>(null);
    readonly activeDirectChatUser = this.activeDirectChatUserSignal.asReadonly();
    
    private usersCache = new Map<string, User>();
    private usersListCache: User[] | null = null;
    private usersListPromise: Promise<User[]> | null = null;

    clearCache() {
        this.usersListCache = null;
        this.usersListPromise = null;
    }

    
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

    
    selectDirectChatUser(user: User | null) {
        this.activeDirectChatUserSignal.set(user);
    }

    private normalizeUser(user: User): User {
        const normalizedAvatar = this.avatarSvc.normalizeAvatarUrl(user.avatar_url || '');
        return { ...user, avatar_url: normalizedAvatar || user.avatar_url };
    }

    
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

    
    async getAllUsers(forceRefresh = false): Promise<User[]> {
        if (forceRefresh) this.clearCache();
        if (this.usersListCache) return this.usersListCache;
        if (this.usersListPromise) return this.usersListPromise;
        this.usersListPromise = this.fetchAllUsers().finally(() => this.usersListPromise = null);
        return this.usersListPromise;
    }

    private async fetchAllUsers(): Promise<User[]> {
        const { data, error } = await this.supabaseSvc.supabase.from('profiles').select('*');
        if (error) return console.error('Fehler beim Laden der User:', error.message), [];
        const users = (data as User[]).map((user) => this.normalizeUser(user));
        users.forEach((u) => this.usersCache.set(u.id, u));
        this.usersListCache = users;
        return users;
    }

    
    private getLocalTeamUser(): User {
        return { id: 'dabubble-team-local-id', display_name: 'DABubble-Team', email: 'team@dabubble.local', avatar_url: 'img/logo/Logo.svg', status: 'online' };
    }

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