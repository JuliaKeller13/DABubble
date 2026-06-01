import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthResponse, User } from '@supabase/supabase-js';
import { User as UserProfile } from '../interfaces/user.interface';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private supabaseSvc = inject(supabaseService);
    private currentUserSignal = signal<User | null>(null);
    private currentUserProfileSignal = signal<UserProfile | null>(null);

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
        if (!user) return this.currentUserProfileSignal.set(null);
        const { data, error } = await this.supabaseSvc.supabase
            .from('profiles').select('*').eq('id', user.id).single();
        if (error) {
            console.error('Error loading profile:', error);
            return this.currentUserProfileSignal.set(null);
        }
        
        const profile = data as UserProfile;
        
        // Update user status to online in the database if it is not already online
        if (profile.status !== 'online') {
            const { error: updateError } = await this.supabaseSvc.supabase
                .from('profiles')
                .update({ status: 'online' })
                .eq('id', user.id);
            if (!updateError) {
                profile.status = 'online';
            } else {
                console.error('Error updating status to online:', updateError);
            }
        }
        
        this.currentUserProfileSignal.set(profile);
    }

    async loginWithEmail(email: string, password: string): Promise<AuthResponse> {
        return await this.supabaseSvc.supabase.auth.signInWithPassword({
            email,
            password
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
                redirectTo: redirectTo || window.location.origin + '/main'
            }
        });
    }

    async signup(name: string, email: string, password: string): Promise<{ error: any, data: any }> {
        const { data, error } = await this.supabaseSvc.supabase.auth.signUp({ email, password });
        if (error || !data.user) return { error, data };
        const { error: profileError } = await this.supabaseSvc.supabase
            .from('profiles').upsert({ id: data.user.id, display_name: name, email });
        return { error: error || profileError, data };
    }

    async logout(): Promise<void> {
        const currentUser = this.currentUserSignal();
        if (currentUser) {
            // Update user status to offline in the database before signing out
            await this.supabaseSvc.supabase
                .from('profiles')
                .update({ status: 'offline' })
                .eq('id', currentUser.id);
        }
        await this.supabaseSvc.supabase.auth.signOut();
    }
}