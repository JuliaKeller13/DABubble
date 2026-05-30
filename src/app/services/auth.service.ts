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

  async logout(): Promise<void> {
    await this.supabaseSvc.supabase.auth.signOut();
  }
}