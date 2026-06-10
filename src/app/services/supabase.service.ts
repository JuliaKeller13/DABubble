import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

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
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    }
}