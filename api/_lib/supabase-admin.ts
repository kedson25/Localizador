import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const value = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

  if (!value) {
    throw new Error('SUPABASE_URL_NOT_CONFIGURED');
  }

  return value.trim();
}

function getServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED');
  }

  return value.trim();
}

function getAnonKey(): string {
  const value =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error('SUPABASE_ANON_KEY_NOT_CONFIGURED');
  }

  return value.trim();
}

const commonOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      getSupabaseUrl(),
      getServiceRoleKey(),
      commonOptions
    );
  }

  return adminClient;
}

export function getSupabaseAuthClient(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(getSupabaseUrl(), getAnonKey(), commonOptions);
  }

  return authClient;
}
