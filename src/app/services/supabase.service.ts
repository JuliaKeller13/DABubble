import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class supabaseService {
    public supabase: SupabaseClient;

    // Initializes the Supabase client connection using environment configurations
    constructor() {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    }
}