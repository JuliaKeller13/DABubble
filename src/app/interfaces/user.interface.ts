export interface User {
    id: string;
    display_name: string;
    email: string;
    avatar_url: string;
    status: 'online' | 'offline' | 'away';
    custom_status?: string;
    created_at?: string;
}