import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteAccount } from './delete-account.service.ts';
import { corsHeaders, json } from './delete-account.utils.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = request.headers.get('Authorization');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ error: 'Missing Supabase environment variables.' }, 500);
    }

    if (!authHeader) {
      return json({ error: 'Missing authorization header.' }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    const userId = user.id;

    await deleteAccount({ adminClient, userId });

    return json({ success: true });
  } catch (error) {
    console.error('delete-account function failed:', error);
    return json({ error: 'Account deletion failed.' }, 500);
  }
});