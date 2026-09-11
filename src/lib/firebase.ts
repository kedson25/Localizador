import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, memoryLocalCache, memoryLruGarbageCollector,
  doc, collection, getDocFromServer, onSnapshot, connectFirestoreEmulator,
  type DocumentData, type DocumentReference
} from 'firebase/firestore';
import { createFirestoreTransport } from './firestoreTransport';

const firebaseConfig = {
  apiKey: "AIzaSyCfpBmn3cdKP9vaGrDzKCB7oRPMSMx02tA",
  authDomain: "ecooy-5b791.firebaseapp.com",
  databaseURL: "https://ecooy-5b791-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ecooy-5b791",
  storageBucket: "ecooy-5b791.firebasestorage.app",
  messagingSenderId: "824859587278",
  appId: "1:824859587278:web:9a6b5a4485af41e70dd69f",
  measurementId: "G-LDCXYXPEXF"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Firestore is the shared source of truth. Only the bounded, durable write journal
// keeps unsent operations on disk; there is no second cache of operational data.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 40 * 1024 * 1024 }) })
});
if (import.meta.env?.VITE_FIRESTORE_EMULATOR_HOST) {
  const [host, port] = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port || 8080));
}
const writeToFirestore = createFirestoreTransport(db);

export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Firebase operation timed out after ${ms}ms`)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

// Reads may be retried; writes are retried exclusively by the durable outbox.
export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, initialDelayMs = 500): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (attempt + 1 >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, initialDelayMs * 2 ** attempt));
    }
  }
  throw new Error('Operation failed after retries.');
}

export function validateAndCleanIds(rawInputs: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of rawInputs) {
    if (!raw) continue;
    let value = String(raw).trim().replace(/d[çc]?⁴/gi, '4').replace(/d[çc]?4/gi, '4').replace(/^[^0-9a-zA-Z]+/, '');
    const match = value.match(/(47\d+)/);
    value = (match ? match[1] : value.replace(/m$/i, '')).toUpperCase();
    if (value.length >= 3) unique.add(value);
  }
  return [...unique];
}

export interface RefugoData { rawText: string; totalRows: number; updatedAt?: any; fileName?: string; }
export interface ColetorData extends RefugoData {}
export interface RefugoScan {
  id: string;
  rota: string;
  scannedAt: string;
  status: 'found' | 'not_found';
  foundBy?: string;
  generation?: string | null;
}
const refugoPath = ['refugo', 'current_refugo_csv'];
const coletorPath = ['coletor', 'current_csv'];
const scansPath = ['refugo', 'current_refugo_scans'];
const refAt = (path: string[]) => doc(db, path.join('/'));

function saveCsv(path: string[], rawText: string, totalRows: number, fileName: string) {
  if (new TextEncoder().encode(rawText).length > 950000) {
    return Promise.reject(new Error('O CSV excede o limite do documento Firestore (950 KB). Divida o arquivo antes de importar.'));
  }
  return writeToFirestore([{ path, mode: 'set', data: { rawText, totalRows, fileName, updatedAt: new Date().toISOString() } }]);
}
async function loadData<T>(reference: DocumentReference<DocumentData>): Promise<T | null> {
  const snapshot = await withTimeout(getDocFromServer(reference));
  return snapshot.exists() ? snapshot.data() as T : null;
}
function listenToCsv<T extends RefugoData>(path: string[], callback: (data: T | null) => void, onError?: (error: Error) => void) {
  let lastText: string | undefined;
  let lastDate: unknown;
  return onSnapshot(refAt(path), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.exists() ? snapshot.data() as T : null;
    if (data && data.rawText === lastText && data.updatedAt === lastDate) return;
    lastText = data?.rawText;
    lastDate = data?.updatedAt;
    callback(data);
  }, error => { console.error('Falha na sincroniza??o da base:', error); onError?.(error); });
}
export const saveRefugo = (rawText: string, totalRows: number, fileName = 'refugo.csv') => saveCsv(refugoPath, rawText, totalRows, fileName);
export const loadRefugo = () => loadData<RefugoData>(refAt(refugoPath));
export const clearRefugo = () => writeToFirestore([{ path: refugoPath, mode: 'delete' }]);
export const listenToRefugo = (callback: (data: RefugoData | null) => void, onError?: (error: Error) => void) => listenToCsv(refugoPath, callback, onError);
export const saveToColetor = (rawText: string, totalRows: number, fileName = 'relatorio.csv') => saveCsv(coletorPath, rawText, totalRows, fileName);
export const loadFromColetor = () => loadData<ColetorData>(refAt(coletorPath));
export const clearColetor = () => writeToFirestore([{ path: coletorPath, mode: 'delete' }]);
export const listenToColetor = (callback: (data: ColetorData | null) => void, onError?: (error: Error) => void) => listenToCsv(coletorPath, callback, onError);

export function refugoScanKey(id: string): string {
  const normalized = id.trim().toUpperCase();
  return encodeURIComponent(normalized.replace(/\D/g, '') || normalized);
}
export async function saveRefugoScan(scan: RefugoScan, generation: string | null): Promise<boolean> {
  return writeToFirestore([{ path: [...scansPath, 'items', refugoScanKey(scan.id)], mode: 'set', data: { ...scan, generation } }],
    { path: scansPath, allowMissing: true, field: 'generation', equals: generation });
}
// Kept for existing integrations; each scan has a deterministic independent document.
export async function saveRefugoScans(scans: RefugoScan[]): Promise<boolean> {
  const state = await loadData<{ generation?: string }>(refAt(scansPath));
  for (const scan of scans) await saveRefugoScan(scan, state?.generation ?? null);
  return true;
}
export async function loadRefugoScans(): Promise<RefugoScan[] | null> {
  const state = await loadData<{ scans?: RefugoScan[] }>(refAt(scansPath));
  return state?.scans || [];
}
export const clearRefugoScans = () => writeToFirestore([{ path: scansPath, mode: 'set', data: { generation: crypto.randomUUID(), scans: [], updatedAt: new Date().toISOString() } }]);
export function listenToRefugoScans(callback: (scans: RefugoScan[], generation: string | null) => void, onError?: (error: Error) => void): () => void {
  let generation: string | null = null;
  let legacy: RefugoScan[] = [];
  const items = new Map<string, RefugoScan>();
  let parentReady = false;
  let childReady = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    if (!parentReady || !childReady || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const merged = new Map<string, RefugoScan>();
      for (const item of legacy) merged.set(refugoScanKey(item.id), item);
      for (const [key, item] of items) if ((item.generation ?? null) === generation) merged.set(key, item);
      callback([...merged.values()].sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt))), generation);
    }, 40);
  };
  const fail = (error: Error) => { console.error('Falha na sincroniza??o do refugo:', error); onError?.(error); };
  const stopParent = onSnapshot(refAt(scansPath), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.data();
    generation = data?.generation ?? null;
    legacy = Array.isArray(data?.scans) ? data.scans : [];
    parentReady = true;
    publish();
  }, fail);
  const stopItems = onSnapshot(collection(db, ...scansPath as [string, ...string[]], 'items'), { includeMetadataChanges: true }, snapshot => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'removed') items.delete(change.doc.id);
      else items.set(change.doc.id, change.doc.data() as RefugoScan);
    }
    childReady = !snapshot.metadata.fromCache || !snapshot.empty;
    publish();
  }, fail);
  return () => { stopParent(); stopItems(); if (timer) clearTimeout(timer); items.clear(); };
}

export { listenToListas, saveLista, saveListaItemsBatch, flushSaveLista, deleteLista, getListaById, fetchListasPaginated, startListasSync } from './coletaSync';
