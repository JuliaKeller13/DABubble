import { Injectable, inject, signal } from '@angular/core';
import { supabaseService } from './supabase.service';
import { User } from '../interfaces/user.interface';

@Injectable({
    providedIn: 'root'
})
export class userService {
    private supabaseSvc = inject(supabaseService);
    private activeDirectChatUserSignal = signal<User | null>(null);
    readonly activeDirectChatUser = this.activeDirectChatUserSignal.asReadonly();
    
    private usersCache = new Map<string, User>();

    
    filterDuplicateGuests(users: User[], currentUserId: string | null): User[] {
        const guests = users.filter((u) => u.display_name === 'Gast');
        if (guests.length <= 1) return users;
        const currentGuest = currentUserId ? guests.find((u) => u.id === currentUserId) : null;
        const guestToShow = currentGuest || guests[0];
        return users.filter((u) => u.display_name !== 'Gast' || u.id === guestToShow.id);
    }

    
    selectDirectChatUser(user: User | null) {
        this.activeDirectChatUserSignal.set(user);
    }

    
    async upsertProfile(user: User): Promise<any> {
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .upsert({
                id: user.id,
                display_name: user.display_name,
                email: user.email,
                avatar_url: user.avatar_url,
                status: user.status
            });

        if (error) {
            console.error('Fehler beim Speichern des Profils:', error.message);
            throw error;
        }
        
        this.usersCache.set(user.id, user);
        return data;
    }

    
    async getAllUsers(): Promise<User[]> {
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .select('*');

        if (error) {
            console.error('Fehler beim Laden der User:', error.message);
            return [];
        }
        
        const users = data as User[];
        users.forEach((u) => this.usersCache.set(u.id, u));
        return users;
    }

    
    async getUserById(id: string): Promise<User | null> {
        if (this.usersCache.has(id)) {
            return this.usersCache.get(id) || null;
        }

        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Fehler beim Laden des Users:', error.message);
            return null;
        }
        
        const user = data as User;
        this.usersCache.set(id, user);
        return user;
    }
}