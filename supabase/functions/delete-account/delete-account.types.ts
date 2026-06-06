import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type DeleteAccountContext = {
  adminClient: SupabaseClient;
  userId: string;
};

export type MessageWithReactions = {
  id: string;
  reactions: Record<string, string[]> | null;
};

export type OwnedChannelRow = {
  id: string;
};

export type ChannelMembershipRow = {
  user_id: string;
};
