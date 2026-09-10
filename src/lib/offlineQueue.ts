import type { ColetaItem } from '../types';

export interface OutboxBipEntry {
  uniqueKey: string;
  listaId: string;
  itemId: string;
  item: ColetaItem;
  syncStatus: 'pendente' | 'sincronizando' | 'sincronizado';
  createdAt: number;
  retryCount: number;
  lastError?: string;
  revision?: string;
}

export interface SyncEngineStatus {
  isOnline: boolean;
  pendingCount: number;
  syncingCount: number;
  syncedCount: number;
  statusLabel: string;
  lastSyncTime: string | null;
  error?: string;
}

interface AdditionalSyncStatus {
  pendingCount: number;
  syncingCount: number;
  lastError?: string;
  lastSyncTime?: string | null;
}

type SyncBatch = (listaId: string, items: ColetaItem[]) => Promise<boolean>;
type OnItemsSynced = (listaId: string, syncedItemIds: string[]) => void;

const DB_NAME = 'ColetaOfflineOutboxDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_outbox';
const statusListeners = new Set<(status: SyncEngineStatus) => void>();
const queueListeners = new Set<() => void>();
let dbPromise: Promise<IDBDatabase> | null = null;
let revisionSequence = 0;
let storageError: string | undefined;
let storageReadError: string | undefined;
let uploadError: string | undefined;
let lastCounts = { pendingCount: 0, syncingCount: 0 };
let lastSyncTime: string | null = null;
let additionalStatus: AdditionalSyncStatus = { pendingCount: 0, syncingCount: 0 };
let notificationPending = false;
let notificationRequested = false;
let syncPromise: Promise<void> | null = null;
let lastPassFailed = false;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Erro desconhecido');
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function openOutboxDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Armazenamento local indisponível neste navegador'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let failed = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'uniqueKey' });
        store.createIndex('listaId', 'listaId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => {
      failed = true;
      reject(request.error || new Error('Não foi possível abrir o armazenamento local'));
    };
    request.onblocked = () => {
      failed = true;
      reject(new Error('Armazenamento local bloqueado por outra aba; feche a aba antiga'));
    };
  });
  dbPromise = opening;
  void opening.catch(() => { if (dbPromise === opening) dbPromise = null; });
  return opening;
}

// A successful request is not a durable write until its transaction commits.
async function withStore<T>(
  mode: IDBTransactionMode,
  initialResult: T,
  schedule: (store: IDBObjectStore, result: (value: T) => void) => void
): Promise<T> {
  try {
    const db = await openOutboxDB();
    const result = await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      let result = initialResult;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Gravação local cancelada'));
      tx.onerror = () => reject(tx.error || new Error('Falha no armazenamento local'));
      try {
        schedule(tx.objectStore(STORE_NAME), value => { result = value; });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
    if (mode === 'readonly') storageReadError = undefined;
    else storageError = undefined;
    return result;
  } catch (error) {
    const message = `Falha no armazenamento local: ${errorMessage(error)}`;
    if (mode === 'readonly') storageReadError = message;
    else storageError = message;
    throw error;
  }
}

function makeEntry(listaId: string, item: ColetaItem): OutboxBipEntry {
  return {
    uniqueKey: `${listaId}_${item.id}`,
    listaId,
    itemId: item.id,
    item: { ...item, syncStatus: 'pendente' },
    syncStatus: 'pendente',
    createdAt: Date.now(),
    retryCount: 0,
    revision: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${++revisionSequence}-${Math.random().toString(36).slice(2)}`
  };
}

function queueChanged(): void {
  void notifySyncStatusChange();
  queueListeners.forEach(listener => listener());
}

export async function enqueueBipLocally(listaId: string, item: ColetaItem): Promise<boolean> {
  return enqueueBatchBipsLocally(listaId, [item]);
}

export async function enqueueBatchBipsLocally(listaId: string, items: ColetaItem[]): Promise<boolean> {
  if (!items?.length) return true;
  try {
    await withStore('readwrite', undefined, store => {
      for (const item of items) store.put(makeEntry(listaId, item));
    });
    storageError = undefined;
    queueChanged();
    return true;
  } catch (error) {
    console.error('Não foi possível guardar os IDs neste dispositivo:', error);
    void notifySyncStatusChange();
    return false;
  }
}

export async function getPendingEntries(listaId?: string): Promise<OutboxBipEntry[]> {
  return withStore<OutboxBipEntry[]>('readonly', [], (store, result) => {
    const request = listaId === undefined ? store.getAll() : store.index('listaId').getAll(listaId);
    request.onsuccess = () => result((request.result as OutboxBipEntry[]).filter(entry =>
      entry.syncStatus === 'pendente' || entry.syncStatus === 'sincronizando'
    ));
  });
}

export async function getPendingItemIdsForLista(listaId: string): Promise<Set<string>> {
  return new Set((await getPendingEntries(listaId)).map(entry => entry.itemId));
}

async function updateEntriesStatus(
  keys: string[],
  status: OutboxBipEntry['syncStatus'],
  expected?: Map<string, OutboxBipEntry>,
  failure?: string
): Promise<OutboxBipEntry[]> {
  const changed: OutboxBipEntry[] = [];
  await withStore('readwrite', undefined, store => {
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result as OutboxBipEntry | undefined;
        if (!current) return;
        const previous = expected?.get(key);
        // A new scan/edit of this same ID must survive an older upload finishing.
        if (expected && (!previous || current.revision !== previous.revision || current.createdAt !== previous.createdAt)) return;
        if (status === 'sincronizado') {
          store.delete(key);
        } else {
          store.put({
            ...current,
            syncStatus: status,
            item: { ...current.item, syncStatus: status },
            retryCount: (current.retryCount || 0) + (failure ? 1 : 0),
            lastError: failure
          });
        }
        changed.push(current);
      };
    }
  });
  void notifySyncStatusChange();
  return changed;
}

export async function markEntriesStatus(keys: string[], status: OutboxBipEntry['syncStatus']): Promise<void> {
  if (!keys?.length) return;
  await updateEntriesStatus(keys, status);
}

// Call before the remote delete. Awaiting an existing upload prevents its late
// acknowledgement/write from recreating an item after that remote deletion.
export async function removePendingItems(listaId: string, itemIds?: string[]): Promise<void> {
  const selected = itemIds === undefined ? null : new Set(itemIds);
  await withStore('readwrite', undefined, store => {
    const request = store.index('listaId').openCursor(IDBKeyRange.only(listaId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!selected || selected.has((cursor.value as OutboxBipEntry).itemId)) cursor.delete();
      cursor.continue();
    };
  });
  await syncPromise;
  queueChanged();
}

export function setAdditionalSyncStatus(status: AdditionalSyncStatus): void {
  additionalStatus = { ...status };
  void notifySyncStatusChange();
}

export async function getOutboxMetrics(): Promise<SyncEngineStatus> {
  try {
    lastCounts = await withStore('readonly', { pendingCount: 0, syncingCount: 0 }, (store, result) => {
      const counts = { pendingCount: 0, syncingCount: 0 };
      const index = store.index('syncStatus');
      const pending = index.count('pendente');
      const syncing = index.count('sincronizando');
      pending.onsuccess = () => { counts.pendingCount = pending.result; result(counts); };
      syncing.onsuccess = () => { counts.syncingCount = syncing.result; result(counts); };
    });
  } catch {
    // Keep the last known counts and publish the error; never show false success.
  }
  const online = isOnline();
  const pendingCount = lastCounts.pendingCount + additionalStatus.pendingCount;
  const syncingCount = lastCounts.syncingCount + additionalStatus.syncingCount;
  const error = storageError || storageReadError || additionalStatus.lastError || uploadError;
  const statusLabel = error || (!online
    ? (pendingCount + syncingCount > 0 ? `${pendingCount + syncingCount} pendentes (offline)` : 'offline')
    : syncingCount > 0 ? `sincronizando ${syncingCount}`
    : pendingCount > 0 ? `${pendingCount} pendentes` : 'sincronizado');
  return {
    isOnline: online,
    pendingCount,
    syncingCount,
    syncedCount: 0,
    statusLabel,
    lastSyncTime: additionalStatus.lastSyncTime || lastSyncTime,
    error
  };
}

export function subscribeSyncStatus(callback: (status: SyncEngineStatus) => void): () => void {
  statusListeners.add(callback);
  void getOutboxMetrics().then(status => {
    if (statusListeners.has(callback)) callback(status);
  }).catch(error => console.error('Erro ao atualizar status de sincronização:', error));
  const onNetworkChange = () => { void notifySyncStatusChange(); };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onNetworkChange);
    window.addEventListener('offline', onNetworkChange);
  }
  return () => {
    statusListeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onNetworkChange);
      window.removeEventListener('offline', onNetworkChange);
    }
  };
}

export async function notifySyncStatusChange(): Promise<void> {
  notificationRequested = true;
  if (notificationPending) return;
  notificationPending = true;
  try {
    do {
      notificationRequested = false;
      const metrics = await getOutboxMetrics();
      statusListeners.forEach(callback => {
        try { callback(metrics); } catch (error) { console.error('Erro ao atualizar status de sincronização:', error); }
      });
    } while (notificationRequested);
  } finally {
    notificationPending = false;
  }
}

async function syncPass(syncBatchToFirebase: SyncBatch, onItemsSynced?: OnItemsSynced): Promise<void> {
  lastPassFailed = false;
  if (!isOnline()) return;
  try {
    const pending = await getPendingEntries();
    const groups = new Map<string, OutboxBipEntry[]>();
    for (const entry of pending) {
      const entries = groups.get(entry.listaId) || [];
      entries.push(entry);
      groups.set(entry.listaId, entries);
    }
    for (const [listaId, entries] of groups) {
      for (let offset = 0; offset < entries.length; offset += 100) {
        if (!isOnline()) return;
        const snapshot = entries.slice(offset, offset + 100);
        const expected = new Map(snapshot.map(entry => [entry.uniqueKey, entry]));
        const claimed = await updateEntriesStatus(snapshot.map(entry => entry.uniqueKey), 'sincronizando', expected);
        if (!claimed.length) continue;
        const keys = claimed.map(entry => entry.uniqueKey);
        let failure: string | undefined;
        try {
          const success = await syncBatchToFirebase(listaId, claimed.map(entry => ({ ...entry.item, syncStatus: 'sincronizado' })));
          if (!success) failure = 'Servidor não confirmou o recebimento dos IDs';
        } catch (error) {
          failure = errorMessage(error);
        }
        if (failure) {
          lastPassFailed = true;
          uploadError = `Falha ao sincronizar: ${failure}`;
          await updateEntriesStatus(keys, 'pendente', expected, failure);
          break;
        }
        const committed = await updateEntriesStatus(keys, 'sincronizado', expected);
        lastSyncTime = new Date().toLocaleTimeString('pt-BR');
        storageError = undefined;
        uploadError = undefined;
        if (committed.length && onItemsSynced) {
          try { onItemsSynced(listaId, committed.map(entry => entry.itemId)); }
          catch (error) { console.error('Erro ao atualizar os itens sincronizados na tela:', error); }
        }
        // Yield between batches so importing many IDs does not monopolize the UI.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (error) {
    lastPassFailed = true;
    console.error('Sincronização local interrompida; os IDs continuam na fila:', error);
  } finally {
    void notifySyncStatusChange();
  }
}

export function processOutboxSync(syncBatchToFirebase: SyncBatch, onItemsSynced?: OnItemsSynced): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = syncPass(syncBatchToFirebase, onItemsSynced).finally(() => { syncPromise = null; });
  return syncPromise;
}

// One global runner in App survives route changes. Work starts after a committed
// enqueue, at startup, and on reconnect; retries use one cancellable timeout.
export function startOutboxSync(syncBatchToFirebase: SyncBatch, onItemsSynced?: OnItemsSynced): () => void {
  let disposed = false;
  let running = false;
  let requested = false;
  let retryDelay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay = 0) => {
    if (disposed) return;
    requested = true;
    if (running) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  const run = async () => {
    if (disposed || running || !isOnline()) return;
    running = true;
    requested = false;
    await processOutboxSync(syncBatchToFirebase, onItemsSynced);
    running = false;
    if (disposed || !isOnline()) return;
    if (lastPassFailed) {
      schedule(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    } else {
      retryDelay = 1000;
      if (requested) schedule();
    }
  };
  const wake = () => { retryDelay = 1000; schedule(); };
  const onVisibility = () => { if (document.visibilityState === 'visible') wake(); };
  queueListeners.add(wake);
  if (typeof window !== 'undefined') window.addEventListener('online', wake);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  schedule();
  return () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    queueListeners.delete(wake);
    if (typeof window !== 'undefined') window.removeEventListener('online', wake);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  };
}
