import { createClient } from '@supabase/supabase-js';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from './firebase';
import type { Database } from './database.types';
import { resetSyncStatus, syncFailure } from '../services/syncStatus';

// Vite embeds public values at build time. Hosted builds do not receive the
// developer's ignored .env file, so keep the project's public configuration as
// a safe fallback. This is a publishable browser key, never a secret/service key.
const defaultUrl = 'https://uncspldfjqqaaszlglkp.supabase.co';
const defaultPublishableKey = 'sb_publishable_cz-ALYKU7T-zUCI_wk63zQ_WluC3Rmy';
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const url = configuredUrl?.startsWith('https://') ? configuredUrl : defaultUrl;
const key = configuredKey?.startsWith('sb_publishable_') && !configuredKey.includes('your_key_here')
  ? configuredKey : defaultPublishableKey;
export const supabase = createClient<Database>(url, key, {
  accessToken: async () => {
    await auth.authStateReady();
    return await auth.currentUser?.getIdToken() ?? null;
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }),
  },
});
const stopTokenListener = onIdTokenChanged(auth, user => {
  if (!user) {
    resetSyncStatus();
    void supabase.removeAllChannels().catch(() => syncFailure('auth', 'Não foi possível encerrar a conexão.'));
    return;
  }
  void user.getIdToken().then(token => supabase.realtime.setAuth(token))
    .catch(() => syncFailure('auth', 'Não foi possível renovar a sessão do Firebase. Entre novamente.'));
});
if (import.meta.hot) import.meta.hot.dispose(() => { stopTokenListener(); void supabase.removeAllChannels(); });
