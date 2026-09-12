const DB_NAME = 'localizador-offline';
const STORE_NAME = 'mutations';
const KEY_NAME = 'encryption-key';
const RETRY_EVENT = 'localizador:offline-retry';

interface QueueRecord {
  id: string;
  namespace: string;
  iv: ArrayBuffer;
  payload: ArrayBuffer;
  createdAt: number;
}

const flushing = new Set<string>();

function supported() {
  return typeof indexedDB !== 'undefined' && typeof crypto?.subtle !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache offline.'));
  });
}

async function getKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_NAME);
    request.onsuccess = () => resolve(request.result?.key as CryptoKey | undefined);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ id: KEY_NAME, key });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return key;
}

function records(db: IDBDatabase): Promise<QueueRecord[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as QueueRecord[]).filter(record => record.id !== KEY_NAME).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  });
}

function remove(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineMutation<T>(namespace: string, payload: T): Promise<void> {
  if (!supported()) throw new Error('Este navegador não suporta o cache offline seguro.');
  const db = await openDatabase();
  const key = await getKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
      id: crypto.randomUUID(), iv: iv.buffer, payload: encrypted, createdAt: Date.now(),
      namespace,
    } satisfies QueueRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
  window.dispatchEvent(new Event(RETRY_EVENT));
}

export async function flushOfflineMutations<T>(namespace: string, send: (payload: T) => Promise<void>): Promise<void> {
  if (flushing.has(namespace) || !supported() || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  flushing.add(namespace);
  try {
    const db = await openDatabase();
    const key = await getKey(db);
    for (const record of (await records(db)).filter(item => item.namespace === namespace)) {
      try {
        const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.payload);
        await send(JSON.parse(new TextDecoder().decode(decoded)) as T);
        await remove(db, record.id);
      } catch {
        break;
      }
    }
    db.close();
  } finally { flushing.delete(namespace); }
}

export function onOfflineRetry(callback: () => void): () => void {
  const retry = () => callback();
  window.addEventListener('online', retry);
  window.addEventListener(RETRY_EVENT, retry);
  return () => { window.removeEventListener('online', retry); window.removeEventListener(RETRY_EVENT, retry); };
}
