import { collection, doc, onSnapshot, setDoc, writeBatch, serverTimestamp,
  getDocs, query, where, orderBy, limit, startAfter, type QueryDocumentSnapshot,
  type DocumentData } from 'firebase/firestore';
import { db, withTimeout } from './firebase';
import type { ColetaItem, ColetaLista } from '../types';
import { readListaStorage, cacheLista, persistListaMutation, acknowledgeListaMutation,
  snapshotLista, diffLista, applyListaMutation, type ListaMutation } from './listaPersistence';
import { getPendingEntries, removePendingItems, setAdditionalSyncStatus } from './offlineQueue';

const COLLECTION = 'coleta_listas';
const base = new Map<string, ColetaLista>();
const visible = new Map<string, ColetaLista>();
const pending = new Map<string, ListaMutation>();
const listeners = new Set<(listas: ColetaLista[]) => void>();
const itemListeners = new Map<string, () => void>();
const childItems = new Map<string, Map<string, ColetaItem & { _deleted?: boolean }>>();
const legacyItems = new Map<string, ColetaItem[]>();
const legacyPending = new Map<string, ColetaItem[]>();
const deletedLists = new Set<string>();
const cacheTimers = new Map<string, ReturnType<typeof setTimeout>>();
let ready: Promise<void> | undefined;
let stopSnapshot: (() => void) | undefined;
let publication: ReturnType<typeof setTimeout> | undefined;
let writeChain: Promise<unknown> = Promise.resolve();
let syncing = false;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let syncUsers = 0;
let lastError: string | undefined;
let lastSyncTime: string | null = null;
let channel: BroadcastChannel | undefined;

function orderedPending() {
  return [...pending.values()].sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER));
}

function reportStatus() {
  let count = 0;
  for (const mutation of pending.values()) count += Math.max(1, mutation.upserts.length + mutation.removedIds.length);
  setAdditionalSyncStatus({ pendingCount: syncing ? 0 : count, syncingCount: syncing ? count : 0,
    lastError, lastSyncTime });
}

function publish() {
  if (publication) return;
  publication = setTimeout(() => {
    publication = undefined;
    const listas = [...visible.values()].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    listeners.forEach(callback => callback(listas));
  }, 16);
}

function refresh(listaId: string, cache = true) {
  let lista = deletedLists.has(listaId) ? undefined : base.get(listaId);
  for (const mutation of orderedPending()) {
    if (mutation.listaId === listaId && !deletedLists.has(listaId)) lista = applyListaMutation(lista, mutation);
  }
  if (lista) visible.set(listaId, snapshotLista(lista));
  else visible.delete(listaId);
  publish();
  if (cache && !cacheTimers.has(listaId)) {
    cacheTimers.set(listaId, setTimeout(() => {
      cacheTimers.delete(listaId);
      void cacheLista(listaId, deletedLists.has(listaId) ? undefined : base.get(listaId)).catch(error => {
        lastError = `Falha no cache local: ${error.message}`; reportStatus();
      });
    }, 200));
  }
}

async function initialize() {
  if (!ready) ready = (async () => {
    const saved = await readListaStorage();
    for (const lista of saved.listas) if (!base.has(lista.id)) base.set(lista.id, lista);
    for (const mutation of saved.mutations) pending.set(mutation.id, mutation);
    // Recover the previous application's outbox, including scans never added to
    // the old parent-document preview. Its own runner acknowledges these later.
    const legacy = await getPendingEntries();
    for (const entry of legacy) {
      const entries = legacyPending.get(entry.listaId) || [];
      entries.push(entry.item); legacyPending.set(entry.listaId, entries);
      const lista = base.get(entry.listaId);
      if (lista && !lista.itens.some(item => item.id === entry.itemId)) lista.itens = [entry.item, ...lista.itens];
    }
    for (const id of new Set([...base.keys(), ...[...pending.values()].map(m => m.listaId)])) refresh(id, false);
    reportStatus(); publish();
  })().catch(error => {
    ready = undefined;
    lastError = `Não foi possível abrir o armazenamento local: ${error.message}`;
    reportStatus(); throw error;
  });
  await ready;
}

function mergeRemoteItems(id: string, fromCache: boolean) {
  const current = base.get(id);
  if (!current || deletedLists.has(id)) return;
  const items = childItems.get(id) || new Map();
  const merged = new Map((fromCache ? current.itens : []).map(item => [item.id, item]));
  for (const item of legacyItems.get(id) || []) merged.set(item.id, { ...item, syncStatus: 'sincronizado' });
  for (const item of items.values()) {
    if (item._deleted) merged.delete(item.id);
    else merged.set(item.id, { ...merged.get(item.id), ...item });
  }
  for (const item of legacyPending.get(id) || []) if (!items.has(item.id)) merged.set(item.id, item);
  base.set(id, { ...current, itens: [...merged.values()] }); refresh(id);
}

function startRealtime() {
  if (stopSnapshot) return;
  stopSnapshot = onSnapshot(collection(db, COLLECTION), { includeMetadataChanges: true }, snapshot => {
    for (const change of snapshot.docChanges()) {
      const id = change.doc.id;
      const data = change.doc.data();
      if (change.type === 'removed' || data._deleted === true) {
        if (snapshot.metadata.fromCache && change.type === 'removed') continue;
        deletedLists.add(id); base.delete(id); childItems.delete(id); legacyItems.delete(id);
        itemListeners.get(id)?.(); itemListeners.delete(id); refresh(id); continue;
      }
      deletedLists.delete(id);
      legacyItems.set(id, Array.isArray(data.itens) ? data.itens : []);
      base.set(id, { ...base.get(id), ...data, id, itens: base.get(id)?.itens || data.itens || [] } as ColetaLista);
      if (!itemListeners.has(id)) {
        const items = new Map<string, ColetaItem & { _deleted?: boolean }>();
        childItems.set(id, items);
        itemListeners.set(id, onSnapshot(collection(db, COLLECTION, id, 'itens'),
          { includeMetadataChanges: true }, itemSnapshot => {
            for (const itemChange of itemSnapshot.docChanges()) {
              const value = itemChange.doc.data();
              const itemId = value.id || decodeURIComponent(itemChange.doc.id);
              if (itemChange.type === 'removed') items.delete(itemId);
              else items.set(itemId, { ...value, id: itemId,
                syncStatus: itemChange.doc.metadata.hasPendingWrites ? 'pendente' : 'sincronizado' } as ColetaItem);
            }
            mergeRemoteItems(id, itemSnapshot.metadata.fromCache);
          }, error => {
            lastError = `Erro ao sincronizar IDs: ${error.message}`; reportStatus();
          }));
      }
      mergeRemoteItems(id, true);
    }
    // Remove genuinely deleted old-style documents, while preserving offline drafts.
    if (!snapshot.metadata.fromCache) {
      const ids = new Set(snapshot.docs.filter(d => d.data()._deleted !== true).map(d => d.id));
      for (const id of base.keys()) {
        if (!ids.has(id) && ![...pending.values()].some(m => m.listaId === id && m.create)) {
          deletedLists.add(id); base.delete(id); refresh(id);
        }
      }
    }
    publish();
  }, error => { lastError = `Erro ao sincronizar listas: ${error.message}`; reportStatus(); publish(); });
}

export function listenToListas(callback: (listas: ColetaLista[]) => void): () => void {
  listeners.add(callback);
  callback([...visible.values()]);
  void initialize().catch(() => {}).then(() => { if (listeners.size || syncUsers) startRealtime(); });
  return () => {
    listeners.delete(callback);
    if (!listeners.size && !syncUsers) stopRealtime();
  };
}

function stopRealtime() {
  stopSnapshot?.(); stopSnapshot = undefined;
  itemListeners.forEach(unsubscribe => unsubscribe()); itemListeners.clear();
}

function itemDocument(listaId: string, itemId: string) {
  return doc(db, COLLECTION, listaId, 'itens', encodeURIComponent(itemId));
}

async function sendMutation(mutation: ListaMutation) {
  const parent = doc(db, COLLECTION, mutation.listaId);
  if (mutation.deleted) {
    await removePendingItems(mutation.listaId);
    await withTimeout(setDoc(parent, { _deleted: true, updatedAt: serverTimestamp() }, { merge: true }), 10000);
    return;
  }
  if (deletedLists.has(mutation.listaId)) return;
  if (mutation.removedIds.length) await removePendingItems(mutation.listaId, mutation.removedIds);
  const operations = [
    ...mutation.upserts.map(item => ({ id: item.id, data: { ...item, _deleted: false } })),
    ...mutation.removedIds.map(id => ({ id, data: { id, _deleted: true } })),
  ];
  // Persist metadata alongside the first chunk. Later chunks never replace item
  // arrays or reset a total to the number of items in the current upload.
  for (let offset = 0; offset < Math.max(1, operations.length); offset += 250) {
    const batch = writeBatch(db);
    if (offset === 0) batch.set(parent, { ...mutation.metadata,
      ...(mutation.create ? { _deleted: false } : {}), updatedAt: serverTimestamp() }, { merge: true });
    for (const operation of operations.slice(offset, offset + 250)) {
      batch.set(itemDocument(mutation.listaId, operation.id), { ...operation.data, updatedAt: serverTimestamp() }, { merge: true });
    }
    await withTimeout(batch.commit(), 10000);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function scheduleSync(delay = 0) {
  if (!syncUsers || syncing) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void synchronize(); }, delay);
}

async function synchronize() {
  if (syncing || !navigator.onLine) { reportStatus(); return; }
  syncing = true; reportStatus();
  try {
    await initialize();
    const run = async () => {
      // Read the journal again under a cross-tab lock so two tabs cannot replay
      // stale item edits after a newer mutation has already been acknowledged.
      const stored = await readListaStorage();
      const storedIds = new Set(stored.mutations.map(m => m.id));
      for (const [id, mutation] of pending) {
        if (mutation.sequence !== undefined && !storedIds.has(id)) { pending.delete(id); refresh(mutation.listaId); }
      }
      for (const mutation of stored.mutations) if (!pending.has(mutation.id)) pending.set(mutation.id, mutation);
      for (const mutation of stored.mutations) {
        await sendMutation(mutation);
        const updated = deletedLists.has(mutation.listaId) ? undefined : applyListaMutation(base.get(mutation.listaId), mutation);
        const confirmed = updated ? { ...updated, itens: updated.itens.map(item => ({ ...item, syncStatus: 'sincronizado' as const })) } : undefined;
        await acknowledgeListaMutation(mutation.sequence!, mutation.listaId, confirmed);
        if (confirmed) base.set(mutation.listaId, confirmed);
        else base.delete(mutation.listaId);
        pending.delete(mutation.id); refresh(mutation.listaId);
        lastSyncTime = new Date().toLocaleTimeString('pt-BR'); lastError = undefined; retryDelay = 1000;
        reportStatus(); channel?.postMessage('changed');
      }
    };
    if (navigator.locks) await navigator.locks.request('coleta-listas-upload', run);
    else await run();
  } catch (error) {
    lastError = `Alterações salvas neste dispositivo; sincronização pendente: ${(error as Error).message}`;
    retryDelay = Math.min(retryDelay * 2, 30000);
  } finally {
    syncing = false; reportStatus();
    if (pending.size) scheduleSync(lastError ? retryDelay : 0);
  }
}

// saveLista acknowledges durable local storage, not an unconfirmed network write.
export async function saveLista(lista: ColetaLista, _immediate = false): Promise<boolean> {
  const mutation = diffLista(lista);
  if (!mutation.create && !Object.keys(mutation.metadata).length && !mutation.upserts.length && !mutation.removedIds.length) return true;
  try {
    await initialize();
    if (deletedLists.has(lista.id)) throw new Error('Esta lista foi excluída em outro dispositivo.');
    pending.set(mutation.id, mutation); refresh(lista.id, false); reportStatus();
    const write = writeChain.catch(() => {}).then(async () => {
      mutation.sequence = await persistListaMutation(mutation, base.get(lista.id));
    });
    writeChain = write;
    await write;
    channel?.postMessage('changed'); scheduleSync();
    return true;
  } catch (error) {
    pending.delete(mutation.id); refresh(lista.id, false);
    lastError = `Não foi possível salvar a alteração: ${(error as Error).message}`; reportStatus();
    console.error(lastError); return false;
  }
}

export async function deleteLista(listaId: string): Promise<boolean> {
  try {
    await initialize();
    const mutation: ListaMutation = { id: crypto.randomUUID(), listaId, metadata: {}, upserts: [], removedIds: [], deleted: true };
    pending.set(mutation.id, mutation); refresh(listaId, false); reportStatus();
    const write = writeChain.catch(() => {}).then(async () => { mutation.sequence = await persistListaMutation(mutation, base.get(listaId)); });
    writeChain = write;
    try { await write; } catch (error) { pending.delete(mutation.id); refresh(listaId, false); throw error; }
    channel?.postMessage('changed'); scheduleSync(); return true;
  } catch (error) { lastError = `Não foi possível excluir a lista: ${(error as Error).message}`; reportStatus(); return false; }
}

export async function flushSaveLista(_listaId: string): Promise<boolean> {
  try { await writeChain; scheduleSync(); return true; } catch { return false; }
}

export async function getListaById(listaId: string): Promise<ColetaLista | null> {
  await initialize();
  if (visible.has(listaId)) return visible.get(listaId)!;
  return new Promise(resolve => {
    let done = false;
    let unsubscribe = () => {};
    const timer = setTimeout(() => { done = true; unsubscribe(); resolve(null); }, 5000);
    unsubscribe = listenToListas(listas => {
      const lista = listas.find(l => l.id === listaId);
      if (lista) { done = true; clearTimeout(timer); unsubscribe(); resolve(lista); }
    });
    if (done) unsubscribe();
  });
}

// Compatibility upload for durable entries created by earlier app versions.
export async function saveListaItemsBatch(listaId: string, items: ColetaItem[], onProgress?: (current: number, total: number, percent: number) => void): Promise<boolean> {
  if (deletedLists.has(listaId)) return true;
  for (let offset = 0; offset < items.length; offset += 250) {
    const batch = writeBatch(db);
    for (const item of items.slice(offset, offset + 250)) {
      const data = Object.fromEntries(Object.entries(item).filter(([key, value]) => key !== 'syncStatus' && value !== undefined));
      batch.set(itemDocument(listaId, item.id), { ...data, _deleted: false, updatedAt: serverTimestamp() }, { merge: true });
    }
    await withTimeout(batch.commit(), 10000);
    const current = Math.min(offset + 250, items.length);
    onProgress?.(current, items.length, Math.round(current / items.length * 100));
  }
  return true;
}

export function startListasSync(): () => void {
  syncUsers++;
  const online = () => { lastError = undefined; scheduleSync(); reportStatus(); };
  const offline = () => reportStatus();
  const reload = async () => {
    try {
      const stored = await readListaStorage();
      const ids = new Set(stored.mutations.map(m => m.id));
      for (const [id, mutation] of pending) if (mutation.sequence !== undefined && !ids.has(id)) pending.delete(id);
      for (const mutation of stored.mutations) pending.set(mutation.id, mutation);
      for (const lista of stored.listas) if (!deletedLists.has(lista.id) && !base.has(lista.id)) base.set(lista.id, lista);
      for (const id of new Set([...visible.keys(), ...base.keys(), ...stored.mutations.map(m => m.listaId)])) refresh(id, false);
      reportStatus(); scheduleSync();
    } catch (error) { lastError = `Falha ao recuperar pendências: ${(error as Error).message}`; reportStatus(); }
  };
  if (syncUsers === 1 && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('coleta-listas-changes'); channel.onmessage = () => { void reload(); };
  }
  window.addEventListener('online', online); window.addEventListener('offline', offline);
  window.addEventListener('focus', online);
  void initialize().then(() => { if (syncUsers) { startRealtime(); scheduleSync(); } }).catch(() => {});
  return () => {
    syncUsers--; window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('focus', online);
    if (!syncUsers) { clearTimeout(syncTimer); channel?.close(); channel = undefined; if (!listeners.size) stopRealtime(); }
  };
}

export async function fetchListasPaginated(options: {
  pageSize?: number; statusFilter?: 'todas' | 'em_andamento' | 'finalizada'; dateFilter?: string;
  lastDocSnap?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<{ listas: ColetaLista[]; lastDocSnap: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
  const constraints = [];
  if (options.statusFilter && options.statusFilter !== 'todas') constraints.push(where('status', '==', options.statusFilter));
  if (options.dateFilter) constraints.push(where('data', '==', options.dateFilter));
  constraints.push(orderBy('data', 'desc'), limit(options.pageSize || 50));
  if (options.lastDocSnap) constraints.push(startAfter(options.lastDocSnap));
  const result = await withTimeout(getDocs(query(collection(db, COLLECTION), ...constraints)), 10000);
  const listas = await Promise.all(result.docs.filter(d => !d.data()._deleted).map(d => getListaById(d.id)));
  return { listas: listas.filter((lista): lista is ColetaLista => !!lista), lastDocSnap: result.docs.at(-1) || null,
    hasMore: result.size === (options.pageSize || 50) };
}
