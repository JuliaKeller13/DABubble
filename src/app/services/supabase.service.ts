import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Custom storage implementation for Supabase auth that dynamically switches storage type.
 * Guest users are stored in sessionStorage to be logged out automatically when the window/tab closes.
 * Standard registered users are stored in localStorage for persistent authentication.
 */
const customAuthStorage = {
    /**
     * Retrieves an item from either sessionStorage or localStorage.
     * If the session is stored in localStorage but belongs to a guest user,
     * it will be automatically migrated to sessionStorage and removed from localStorage.
     * 
     * @param key - The storage lookup key.
     * @returns The retrieved session value as a string, or null if not found.
     */
    getItem(key: string): string | null {
        if (typeof window === 'undefined') return null;
        const sessionVal = sessionStorage.getItem(key);
        if (sessionVal) return sessionVal;

        const localVal = localStorage.getItem(key);
        if (localVal) {
            try {
                const parsed = JSON.parse(localVal);
                const user = parsed?.user;
                const isGuest = user && (user.is_anonymous || user.user_metadata?.display_name === 'Gast' || (user.email && user.email.includes('guest-')));
                if (isGuest) {
                    sessionStorage.setItem(key, localVal);
                    localStorage.removeItem(key);
                    return localVal;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            return localVal;
        }
        return null;
    },

    /**
     * Stores a key-value pair.
     * Evaluates if the session belongs to a guest user (anonymous or display name 'Gast').
     * If it is a guest, writes to sessionStorage and removes from localStorage.
     * Otherwise, writes to localStorage and removes from sessionStorage.
     * 
     * @param key - The storage key.
     * @param value - The session value string to persist.
     */
    setItem(key: string, value: string): void {
        if (typeof window === 'undefined') return;
        try {
            const parsed = JSON.parse(value);
            const user = parsed?.user;
            const isGuest = user && (user.is_anonymous || user.user_metadata?.display_name === 'Gast' || (user.email && user.email.includes('guest-')));
            if (isGuest) {
                sessionStorage.setItem(key, value);
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
                sessionStorage.removeItem(key);
            }
        } catch (e) {
            localStorage.setItem(key, value);
        }
    },

    /**
     * Removes the stored key from both sessionStorage and localStorage.
     * 
     * @param key - The storage key to remove.
     */
    removeItem(key: string): void {
        if (typeof window === 'undefined') return;
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    }
};

@Injectable({
    providedIn: 'root'
})
/**
 * Service that initializes and provides the Supabase client instance
 * for interacting with Supabase database and authentication services.
 */
export class supabaseService {
    /**
     * The initialized Supabase client instance.
     */
    public supabase: SupabaseClient;

    /**
     * Initializes the Supabase client using configuration values from the environment,
     * setting up session persistence, auto token refresh, and session detection in the URL.
     */
    constructor() {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
            auth: {
                persistSession: true,
                storage: customAuthStorage,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    }
}