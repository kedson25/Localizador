import { ColetaItem } from '../types';

export interface OutboxBipEntry {
  uniqueKey: string; // `${listaId}_${itemId}`
  listaId: string;
  itemId: string;
  item: ColetaItem;
  syncStatus: 'pendente' | 'sincronizando' | 'sincronizado';
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface SyncEngineStatus {
  isOnline: boolean;
  pendingCount: number;
  syncingCount: number;
  syncedCount: number;
  statusLabel: string; // "sincronizado" | "sincronizando X" | "X pendentes" | "offline"
  lastSyncTime: string | null;
}

const DB_NAME = 'ColetaOfflineOutboxDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_outbox';

let dbPromise: Promise<IDBDatabase> | null = null;
const statusListeners = new Set<(status: SyncEngineStatus) => void>();

function openOutboxDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'uniqueKey' });
        store.createIndex('listaId', 'listaId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('Failed to open IndexedDB Outbox:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

// Enqueue single item instantly in local IndexedDB
export async function enqueueBipLocally(listaId: string, item: ColetaItem): Promise<boolean> {
  try {
    const db = await openOutboxDB();
    const entry: OutboxBipEntry = {
      uniqueKey: `${listaId}_${item.id}`,
      listaId,
      itemId: item.id,
      item: { ...item, syncStatus: 'pendente' },
      syncStatus: 'pendente',
      createdAt: Date.now(),
      retryCount: 0
    };

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => {
        notifySyncStatusChange();
        resolve(true);
      };
      tx.onerror = () => {
        console.warn('Error saving bip to IndexedDB Outbox:', tx.error);
        resolve(false);
      };
    });
  } catch (e) {
    console.warn('IndexedDB Outbox write failed:', e);
    return false;
  }
}

// Enqueue batch of items instantly in local IndexedDB
export async function enqueueBatchBipsLocally(listaId: string, items: ColetaItem[]): Promise<boolean> {
  if (!items || items.length === 0) return true;
  try {
    const db = await openOutboxDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const now = Date.now();
      for (const item of items) {
        const entry: OutboxBipEntry = {
          uniqueKey: `${listaId}_${item.id}`,
          listaId,
          itemId: item.id,
          item: { ...item, syncStatus: 'pendente' },
          syncStatus: 'pendente',
          createdAt: now,
          retryCount: 0
        };
        store.put(entry);
      }

      tx.oncomplete = () => {
        notifySyncStatusChange();
        resolve(true);
      };
      tx.onerror = () => {
        console.warn('Batch Outbox save failed:', tx.error);
        resolve(false);
      };
    });
  } catch (e) {
    console.warn('Batch IndexedDB Outbox write failed:', e);
    return false;
  }
}

// Fetch pending entries
export async function getPendingEntries(listaId?: string): Promise<OutboxBipEntry[]> {
  try {
    const db = await openOutboxDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OutboxBipEntry[] = req.result || [];
        results = results.filter(e => e.syncStatus === 'pendente' || e.syncStatus === 'sincronizando');
        if (listaId) {
          results = results.filter(e => e.listaId === listaId);
        }
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

// Get set of pending item IDs for a given listaId
export async function getPendingItemIdsForLista(listaId: string): Promise<Set<string>> {
  const entries = await getPendingEntries(listaId);
  return new Set(entries.map(e => e.itemId));
}

// Mark entries as pendente, syncing or synced
export async function markEntriesStatus(keys: string[], status: 'pendente' | 'sincronizando' | 'sincronizado'): Promise<void> {
  if (!keys || keys.length === 0) return;
  try {
    const db = await openOutboxDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const key of keys) {
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) {
          if (status === 'sincronizado') {
            store.delete(key); // Clear synced items from outbox
          } else {
            const updated = { ...req.result, syncStatus: status };
            store.put(updated);
          }
        }
      };
    }

    tx.oncomplete = () => {
      notifySyncStatusChange();
    };
  } catch (e) {
    console.warn('Failed to update outbox status:', e);
  }
}

// Get metrics summary
export async function getOutboxMetrics(): Promise<SyncEngineStatus> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let pendingCount = 0;
  let syncingCount = 0;

  try {
    const db = await openOutboxDB();
    const entries = await new Promise<OutboxBipEntry[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    for (const e of entries) {
      if (e.syncStatus === 'pendente') pendingCount++;
      else if (e.syncStatus === 'sincronizando') syncingCount++;
    }
  } catch (e) {}

  let statusLabel = 'sincronizado';
  if (!isOnline) {
    statusLabel = pendingCount > 0 ? `${pendingCount} pendentes (offline)` : 'offline';
  } else if (syncingCount > 0) {
    statusLabel = `sincronizando ${syncingCount}`;
  } else if (pendingCount > 0) {
    statusLabel = `${pendingCount} pendentes`;
  }

  return {
    isOnline,
    pendingCount,
    syncingCount,
    syncedCount: 0,
    statusLabel,
    lastSyncTime: new Date().toLocaleTimeString('pt-BR')
  };
}

// Event subscription for reactive UI status
export function subscribeSyncStatus(callback: (status: SyncEngineStatus) => void): () => void {
  statusListeners.add(callback);
  getOutboxMetrics().then(callback);

  const handleNetworkChange = () => {
    notifySyncStatusChange();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
  }

  return () => {
    statusListeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    }
  };
}

export async function notifySyncStatusChange() {
  const metrics = await getOutboxMetrics();
  statusListeners.forEach(cb => cb(metrics));
}

// Non-blocking Background Batch Synchronizer with Exponential Backoff
let isSyncRunning = false;
let currentBackoffDelay = 2000;

export async function processOutboxSync(
  syncBatchToFirebase: (listaId: string, items: ColetaItem[]) => Promise<boolean>,
  onItemsSynced?: (listaId: string, syncedItemIds: string[]) => void
): Promise<void> {
  if (isSyncRunning) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifySyncStatusChange();
    return;
  }

  isSyncRunning = true;

  try {
    const pending = await getPendingEntries();
    if (pending.length === 0) {
      currentBackoffDelay = 2000; // Reset delay on clean queue
      isSyncRunning = false;
      notifySyncStatusChange();
      return;
    }

    // Group pending entries by listaId
    const groupsByLista = new Map<string, OutboxBipEntry[]>();
    for (const entry of pending) {
      const list = groupsByLista.get(entry.listaId) || [];
      list.push(entry);
      groupsByLista.set(entry.listaId, list);
    }

    // Process in batches of max 30 items per chunk
    const BATCH_CHUNK_SIZE = 30;

    for (const [listaId, entries] of groupsByLista.entries()) {
      for (let i = 0; i < entries.length; i += BATCH_CHUNK_SIZE) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;

        const chunk = entries.slice(i, i + BATCH_CHUNK_SIZE);
        const keys = chunk.map(c => c.uniqueKey);
        const itemsToSync = chunk.map(c => ({ ...c.item, syncStatus: 'sincronizado' as const }));
        const itemIds = chunk.map(c => c.itemId);

        // Mark as syncing
        await markEntriesStatus(keys, 'sincronizando');

        try {
          const success = await syncBatchToFirebase(listaId, itemsToSync);

          if (success) {
            await markEntriesStatus(keys, 'sincronizado');
            if (onItemsSynced) {
              onItemsSynced(listaId, itemIds);
            }
            currentBackoffDelay = 2000; // Reset delay on success
          } else {
            // Revert status to pendente for retry
            await markEntriesStatus(keys, 'pendente');
            console.warn(`Sync chunk for lista ${listaId} returned false. Will retry in ${currentBackoffDelay}ms`);
            await new Promise(r => setTimeout(r, currentBackoffDelay));
            currentBackoffDelay = Math.min(30000, currentBackoffDelay * 2); // Exponential backoff
            break;
          }
        } catch (err) {
          await markEntriesStatus(keys, 'pendente');
          console.warn(`Sync exception for lista ${listaId}:`, err);
          await new Promise(r => setTimeout(r, currentBackoffDelay));
          currentBackoffDelay = Math.min(30000, currentBackoffDelay * 2); // Exponential backoff
          break;
        }

        // Small yield to main thread to keep UI crisp 60fps
        await new Promise(r => setTimeout(r, 20));
      }
    }
  } finally {
    isSyncRunning = false;
    notifySyncStatusChange();
  }
}
