import { createClient } from '@supabase/supabase-js';

const viteEnv =
  typeof import.meta !== 'undefined' ? ((import.meta as any).env || {}) : {};

const supabaseUrl = viteEnv.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  }
);

export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}
