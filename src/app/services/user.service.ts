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

    // Select active target user for direct messaging
    selectDirectChatUser(user: User | null) {
        this.activeDirectChatUserSignal.set(user);
    }

    // Save or update user profile data in the database
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
        return data;
    }

    // Get all registered user profiles from the database
    async getAllUsers(): Promise<User[]> {
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .select('*');

        if (error) {
            console.error('Fehler beim Laden der User:', error.message);
            return [];
        }
        return data as User[];
    }

    // Fetch a single user profile by ID from the database
    async getUserById(id: string): Promise<User | null> {
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Fehler beim Laden des Users:', error.message);
            return null;
        }
        return data as User;
    }
}