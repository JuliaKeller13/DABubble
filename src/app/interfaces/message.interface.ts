import { User } from './user.interface';

export interface Message {
  id?: string;
  content: string;
  sender_id: string;
  channel_id?: string;
  recipient_id?: string;
  created_at?: string;
  parent_id?: string;
  reactions?: Record<string, string[]>;
  sender?: User;
}
