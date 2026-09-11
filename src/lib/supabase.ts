import { createClient } from '@supabase/supabase-js';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from './firebase';
import type { Database } from './database.types';
import { resetSyncStatus, syncFailure } from '../services/syncStatus';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !key.startsWith('sb_publishable_')) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
}
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
