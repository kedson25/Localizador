import type { ColetaItem, ColetaLista } from '../types';
import { supabase } from './supabase';
import { asJson, type ItemRow, type ListaRow } from './database.types';
import { applyListaMutation, diffLista, snapshotLista, type ListaMutation } from './listaPersistence';
import { databaseOperation, DataError } from '../services/errors';
import { createLiveQuery } from '../services/realtime.service';
import { flushOfflineMutations, onOfflineRetry, queueOfflineMutation } from './offlineQueue';

const PAGE_SIZE = 500;
export function itemFromRow(row: ItemRow): ColetaItem {
  return { ...(row.payload as unknown as ColetaItem), id: row.id, revision: row.revision,
    firebase_uid: row.firebase_uid, user_name: row.user_name, user_email: row.user_email,
    created_at: row.created_at, syncStatus: 'sincronizado' };
}
function listaFromRow(row: ListaRow, itens: ColetaItem[]): ColetaLista {
  return snapshotLista({ ...(row.data as unknown as ColetaLista), id: row.id, revision: row.revision, itens });
}
async function loadMetadata() {
  const rows: ListaRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = await databaseOperation('listas:read', () => supabase.from('coleta_listas').select('*').order('id').range(offset, offset + PAGE_SIZE - 1));
    rows.push(...(batch || []));
    if (!batch || batch.length < PAGE_SIZE) return rows;
  }
}
async function loadItems(listaId?: string) {
  const rows: ItemRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from('coleta_itens').select('*').order('lista_id').order('id').range(offset, offset + PAGE_SIZE - 1);
    if (listaId) query = query.eq('lista_id', listaId);
    const batch = await databaseOperation('listas:read', () => query);
    rows.push(...(batch || []));
    if (!batch || batch.length < PAGE_SIZE) return rows;
  }
}
export async function getListaById(listaId: string): Promise<ColetaLista | null> {
  // A revision bracket prevents publishing items paged across different commits.
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await databaseOperation('listas:read', () => supabase.from('coleta_listas').select('*').eq('id', listaId).maybeSingle());
    if (!row) return null;
    const items = await loadItems(listaId);
    const after = await databaseOperation('listas:read', () => supabase.from('coleta_listas').select('revision').eq('id', listaId).maybeSingle());
    if (!after) return null;
    if (after.revision === row.revision) return listaFromRow(row, items.map(itemFromRow));
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new DataError('conflict', 'A lista está recebendo alterações. Aguarde a sincronização e tente novamente.');
}

const live = createLiveQuery<Map<string, ColetaLista>>('listas', [{ table: 'coleta_listas' }, { table: 'coleta_itens' }],
  async (changed, previous) => {
    if (changed && previous) {
      const next = new Map(previous);
      const ids = [...changed];
      for (let offset = 0; offset < ids.length; offset += 4) {
        const updates = await Promise.all(ids.slice(offset, offset + 4).map(async id => {
          try {
            return [id, await getListaById(id)] as const;
          } catch (error) {
            if (error instanceof DataError && error.kind === 'conflict') {
              setTimeout(() => live.refresh(id), 100);
              return [id, previous.get(id) || null] as const;
            }
            throw error;
          }
        }));
        for (const [id, lista] of updates) { if (lista) next.set(id, lista); else next.delete(id); }
      }
      return next;
    }
    const metadata = await loadMetadata();
    const items = await loadItems();
    const grouped = new Map<string, ColetaItem[]>();
    for (const row of items) { const group = grouped.get(row.lista_id) || []; group.push(itemFromRow(row)); grouped.set(row.lista_id, group); }
    const after = await loadMetadata();
    const revisions = new Map(metadata.map(row => [row.id, row.revision]));
    const next = new Map<string, ColetaLista>();
    for (const row of after) {
      if (revisions.get(row.id) === row.revision) next.set(row.id, listaFromRow(row, grouped.get(row.id) || []));
      else { const stable = await getListaById(row.id); if (stable) next.set(row.id, stable); }
    }
    return next;
  }, change => {
    const row = change.eventType === 'DELETE' ? change.old : change.new;
    return String(change.table === 'coleta_listas' ? row.id || '' : row.lista_id || '') || undefined;
  });

export function listenToListas(callback: (listas: ColetaLista[]) => void, onError?: (error: Error) => void) {
  return live.subscribe(listas => callback([...listas.values()].sort((a, b) => b.data.localeCompare(a.data))), onError);
}
export function startListasSync() { return live.subscribe(() => {}); }
export function refreshListas() { live.refresh(); }
let writeChain: Promise<unknown> = Promise.resolve();
type QueuedListaMutation = ListaMutation;

async function sendMutation(mutation: QueuedListaMutation): Promise<void> {
  const saved = await databaseOperation('listas:write', () => supabase.rpc('mutate_lista', { p_mutation: asJson(mutation) }));
  if (!saved) throw new DataError('database', 'O servidor não confirmou a alteração.');
}

async function sendWithConflictRecovery(mutation: QueuedListaMutation): Promise<void> {
  try {
    await sendMutation(mutation);
  } catch (error) {
    if (!(error instanceof DataError) || error.kind !== 'conflict' || mutation.create || mutation.deleted) throw error;
    const latest = await getListaById(mutation.listaId);
    if (!latest) throw error;
    const rebased = applyListaMutation(snapshotLista(latest), mutation);
    if (!rebased) throw error;
    const retry = diffLista(rebased);
    if (!Object.keys(retry.metadata).length && !retry.upserts.length && !retry.removedIds.length) return;
    await sendMutation(retry);
  }
}

function replayQueuedMutations() {
  void flushOfflineMutations<QueuedListaMutation>('listas', async mutation => {
    await sendMutation(mutation);
    live.refresh(mutation.listaId);
  });
}

if (typeof window !== 'undefined') onOfflineRetry(replayQueuedMutations);

async function submit(mutation: ListaMutation): Promise<boolean> {
  const write = writeChain.catch(() => undefined).then(async () => {
    try {
      await sendWithConflictRecovery(mutation);
      return true;
    } catch (error) {
      if (error instanceof DataError && error.kind === 'network') {
        await queueOfflineMutation('listas', mutation);
        return true;
      }
      throw error;
    } finally { live.refresh(mutation.listaId); }
  });
  writeChain = write;
  return write;
}
export async function saveLista(lista: ColetaLista, _immediate = false): Promise<boolean> {
  const mutation = diffLista(lista);
  if (!mutation.create && !Object.keys(mutation.metadata).length && !mutation.upserts.length && !mutation.removedIds.length) return true;
  return submit(mutation);
}
export async function deleteLista(listaId: string): Promise<boolean> {
  const lista = live.current()?.get(listaId) || await getListaById(listaId);
  if (!lista) throw new DataError('conflict', 'Esta lista já foi excluída.');
  return submit({ id: crypto.randomUUID(), listaId, metadata: {}, upserts: [], removedIds: [], deleted: true, expectedRevision: lista.revision });
}
export async function flushSaveLista(_listaId: string): Promise<boolean> { await writeChain; return true; }
export async function saveListaItems(listaId: string, items: ColetaItem[], removedIds: string[] = []): Promise<boolean> {
  const lista = await getListaById(listaId);
  if (!lista) throw new DataError('conflict', 'Esta lista já foi excluída.');
  const ids = new Set([...items.map(item => item.id), ...removedIds]);
  return saveLista({ ...lista, itens: [...items, ...lista.itens.filter(item => !ids.has(item.id))] });
}
export async function saveListaItemsBatch(listaId: string, items: ColetaItem[], onProgress?: (current: number, total: number, percent: number) => void) {
  const saved = await saveListaItems(listaId, items);
  onProgress?.(items.length, items.length, 100); return saved;
}
export async function fetchListasPaginated(options: { pageSize?: number; statusFilter?: 'todas' | 'em_andamento' | 'finalizada'; dateFilter?: string; lastDocSnap?: number | null }) {
  const size = Math.min(options.pageSize || 50, 100);
  const offset = options.lastDocSnap || 0;
  let query = supabase.from('coleta_listas').select('*').order('data->>data', { ascending: false }).order('id').range(offset, offset + size);
  if (options.statusFilter && options.statusFilter !== 'todas') query = query.eq('data->>status', options.statusFilter);
  if (options.dateFilter) query = query.eq('data->>data', options.dateFilter);
  const result = await databaseOperation('listas:read', () => query);
  const rows = (result || []).slice(0, size);
  const ids = rows.map(row => row.id);
  const itemRows: ItemRow[] = [];
  if (ids.length) for (let start = 0; ; start += PAGE_SIZE) {
    const batch = await databaseOperation('listas:read', () => supabase.from('coleta_itens').select('*').in('lista_id', ids).order('lista_id').order('id').range(start, start + PAGE_SIZE - 1));
    itemRows.push(...(batch || [])); if (!batch || batch.length < PAGE_SIZE) break;
  }
  const grouped = new Map<string, ColetaItem[]>();
  for (const row of itemRows) { const group = grouped.get(row.lista_id) || []; group.push(itemFromRow(row)); grouped.set(row.lista_id, group); }
  return { listas: rows.map(row => listaFromRow(row, grouped.get(row.id) || [])), lastDocSnap: offset + rows.length, hasMore: (result?.length || 0) > size };
}
