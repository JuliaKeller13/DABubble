export interface User {
    id: string;
    display_name: string;
    email: string;
    avatar_url: string;
    status: 'online' | 'offline' | 'away';
    created_at?: string;
}