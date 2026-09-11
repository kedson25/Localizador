import type { ColetaItem } from '../types';
import { auth } from './firebase';
import { supabase } from './supabase';
import { asJson } from './database.types';
import { databaseOperation, DataError } from '../services/errors';
import { createLiveQuery, type LiveQuery } from '../services/realtime.service';
import { getListaById, refreshListas } from './coletaSync';

const sessions = new Map<string, LiveQuery<ColetaItem[]>>();
export async function loadIndividualSession(session: string): Promise<ColetaItem[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new DataError('auth', 'Entre novamente para abrir sua sessão individual.');
  const items: ColetaItem[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await databaseOperation('individual:read', () => supabase.from('individual_items').select('*')
      .eq('firebase_uid', uid).eq('session', session).order('created_at', { ascending: false }).order('id').range(offset, offset + 499));
    for (const row of batch || []) items.push({ ...(row.payload as unknown as ColetaItem), id: row.id, revision: row.revision,
      firebase_uid: row.firebase_uid, user_name: row.user_name, user_email: row.user_email, created_at: row.created_at, syncStatus: 'sincronizado' });
    if (!batch || batch.length < 500) return items;
  }
}
export function listenToIndividualSession(session: string, callback: (items: ColetaItem[]) => void, onError?: (error: Error) => void) {
  const uid = auth.currentUser?.uid;
  const key = `${uid}:${session}`;
  let live = sessions.get(key);
  if (!live) {
    live = createLiveQuery(`individual:${key}`, [{ table: 'individual_items', filter: `firebase_uid=eq.${uid}` }], () => loadIndividualSession(session));
    sessions.set(key, live);
  }
  return live.subscribe(callback, onError);
}
function refresh(session: string) { sessions.get(`${auth.currentUser?.uid}:${session}`)?.refresh(); }
export async function saveIndividualItems(session: string, items: ColetaItem[], removedIds: string[] = []): Promise<void> {
  try { await databaseOperation('individual:write', () => supabase.rpc('mutate_individual_items', { p_session: session, p_items: asJson(items), p_removed_ids: removedIds })); }
  finally { refresh(session); }
}
export async function clearIndividualSession(session: string): Promise<void> {
  try { await databaseOperation('individual:write', () => supabase.rpc('mutate_individual_items', { p_session: session, p_items: [], p_removed_ids: [], p_clear: true })); }
  finally { refresh(session); }
}
export async function promoteIndividualSession(session: string, listaId: string): Promise<void> {
  const lista = await getListaById(listaId);
  if (!lista) throw new DataError('conflict', 'A lista foi excluída. Seu rascunho individual foi preservado.');
  try {
    await databaseOperation('individual:write', () => supabase.rpc('promote_individual_session', {
      p_session: session, p_lista_id: listaId,
      p_expected_items: asJson(Object.fromEntries(lista.itens.map(item => [item.id, item.revision]))),
    }));
  } finally { refresh(session); refreshListas(); }
}
