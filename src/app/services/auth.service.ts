import { Injectable, inject, signal, computed } from '@angular/core';
import { supabaseService } from './supabase.service';
import { AuthResponse, User } from '@supabase/supabase-js';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private supabaseSvc = inject(supabaseService);
    private currentUserSignal = signal<User | null>(null);

    readonly currentUser = this.currentUserSignal.asReadonly();
    readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

    constructor() {
        this.supabaseSvc.supabase.auth.getSession().then(({ data }) => {
            this.currentUserSignal.set(data.session?.user ?? null);
        });

        this.supabaseSvc.supabase.auth.onAuthStateChange((_event, session) => {
            this.currentUserSignal.set(session?.user ?? null);
        });
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
        const { data, error } = await this.supabaseSvc.supabase.auth.signUp({
            email,
            password
        });

        if (error || !data.user) {
            return { error, data };
        }

        const { error: profileError } = await this.supabaseSvc.supabase
            .from('profiles')
            .upsert({ id: data.user.id, display_name: name, email });

        return { error: error || profileError, data };
    }

    async logout(): Promise<void> {
        await this.supabaseSvc.supabase.auth.signOut();
    }
}