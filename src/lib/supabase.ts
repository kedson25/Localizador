import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { resetSyncStatus, syncFailure } from '../services/syncStatus';

// These are public browser credentials. Authorization is enforced by Supabase
// Auth and PostgreSQL RLS; the secret/service key never belongs in this app.
const defaultUrl = 'https://uncspldfjqqaaszlglkp.supabase.co';
const defaultPublishableKey = 'sb_publishable_cz-ALYKU7T-zUCI_wk63zQ_WluC3Rmy';
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const url = configuredUrl?.startsWith('https://') ? configuredUrl : defaultUrl;
const key = configuredKey?.startsWith('sb_publishable_') && !configuredKey.includes('your_key_here')
  ? configuredKey : defaultPublishableKey;

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }),
  },
});

let activeUserId: string | null = null;
export function getCurrentUserId(): string | null { return activeUserId; }

const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
  activeUserId = session?.user.id ?? null;
  if (session?.access_token) {
    void supabase.realtime.setAuth(session.access_token)
      .catch(() => syncFailure('auth', 'Não foi possível renovar a sessão do Supabase. Entre novamente.'));
    return;
  }
  resetSyncStatus();
  void supabase.removeAllChannels().catch(() => syncFailure('auth', 'Não foi possível encerrar a conexão.'));
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  authListener.subscription.unsubscribe();
  void supabase.removeAllChannels();
});
