import { collection, doc, onSnapshot, setDoc, writeBatch, serverTimestamp,
  getDocs, query, where, orderBy, limit, startAfter, type QueryDocumentSnapshot,
  type DocumentData } from 'firebase/firestore';
import { db, withTimeout } from './firebase';
import type { ColetaItem, ColetaLista } from '../types';
import { snapshotLista, diffLista, applyListaMutation, type ListaMutation } from './listaPersistence';

const COLLECTION = 'coleta_listas';
const base = new Map<string, ColetaLista>();
const visible = new Map<string, ColetaLista>();
const listeners = new Set<(listas: ColetaLista[]) => void>();
const itemListeners = new Map<string, () => void>();
const childItems = new Map<string, Map<string, ColetaItem & { _deleted?: boolean }>>();
const legacyItems = new Map<string, ColetaItem[]>();
const deletedLists = new Set<string>();
let ready: Promise<void> | undefined;
let stopSnapshot: (() => void) | undefined;
let publication: ReturnType<typeof setTimeout> | undefined;
let writeChain: Promise<unknown> = Promise.resolve();
let syncUsers = 0;
let lastError: string | undefined;
let lastSyncTime: string | null = null;

function reportStatus() {
  return undefined;
}

function publish() {
  if (publication) return;
  publication = setTimeout(() => {
    publication = undefined;
    const listas = [...visible.values()].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    listeners.forEach(callback => callback(listas));
  }, 16);
}

function refresh(listaId: string) {
  let lista = deletedLists.has(listaId) ? undefined : base.get(listaId);
  if (lista) visible.set(listaId, snapshotLista(lista));
  else visible.delete(listaId);
  publish();
}

async function initialize() {
  if (!ready) ready = Promise.resolve();
  await ready;
}

function mergeRemoteItems(id: string, fromCache: boolean) {
  const current = base.get(id);
  if (!current || deletedLists.has(id)) return;
  const items = childItems.get(id) || new Map();
  const merged = new Map((fromCache ? current.itens : []).map(item => [item.id, item]));
  for (const item of items.values()) {
    if (item._deleted) merged.delete(item.id);
    else merged.set(item.id, { ...merged.get(item.id), ...item });
  }
  base.set(id, { ...current, itens: [...merged.values()] }); refresh(id);
}

function startRealtime() {
  if (stopSnapshot) return;
  stopSnapshot = onSnapshot(collection(db, COLLECTION), { includeMetadataChanges: true }, snapshot => {
    for (const change of snapshot.docChanges()) {
      const id = change.doc.id;
      const data = change.doc.data();
      if (change.type === 'removed' || data._deleted === true) {
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
    const ids = new Set(snapshot.docs.filter(d => d.data()._deleted !== true).map(d => d.id));
    for (const id of base.keys()) {
      if (!ids.has(id)) {
        deletedLists.add(id); base.delete(id); refresh(id);
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
    await withTimeout(setDoc(parent, { _deleted: true, updatedAt: serverTimestamp() }, { merge: true }), 10000);
    return;
  }
  if (deletedLists.has(mutation.listaId)) return;
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

export async function saveLista(lista: ColetaLista, _immediate = false): Promise<boolean> {
  const mutation = diffLista(lista);
  if (!mutation.create && !Object.keys(mutation.metadata).length && !mutation.upserts.length && !mutation.removedIds.length) return true;
  try {
    await initialize();
    if (deletedLists.has(lista.id)) throw new Error('Esta lista foi excluída em outro dispositivo.');
    const write = writeChain.catch(() => {}).then(async () => {
      await sendMutation(mutation);
    });
    writeChain = write;
    await write;
    base.set(lista.id, { ...lista, itens: lista.itens.map(item => ({ ...item, syncStatus: 'sincronizado' })) });
    refresh(lista.id);
    return true;
  } catch (error) {
    lastError = `Não foi possível salvar a alteração no banco: ${(error as Error).message}`;
    console.error(lastError); return false;
  }
}

export async function deleteLista(listaId: string): Promise<boolean> {
  try {
    await initialize();
    const mutation: ListaMutation = { id: crypto.randomUUID(), listaId, metadata: {}, upserts: [], removedIds: [], deleted: true };
    const write = writeChain.catch(() => {}).then(async () => { await sendMutation(mutation); });
    writeChain = write;
    await write;
    base.delete(listaId); deletedLists.add(listaId); refresh(listaId);
    return true;
  } catch (error) { lastError = `Não foi possível excluir a lista no banco: ${(error as Error).message}`; return false; }
}

export async function flushSaveLista(_listaId: string): Promise<boolean> {
  try { await writeChain; return true; } catch { return false; }
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

export async function saveListaItems(listaId: string, items: ColetaItem[], removedIds: string[] = []): Promise<boolean> {
  if (deletedLists.has(listaId)) return true;
  const operations = [
    ...items.map(item => ({ id: item.id, data: item })),
    ...removedIds.map(id => ({ id, data: { id, _deleted: true } as unknown as ColetaItem }))
  ];
  for (let offset = 0; offset < operations.length; offset += 250) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(offset, offset + 250)) {
      const data = Object.fromEntries(Object.entries(operation.data).filter(([key, value]) => key !== 'syncStatus' && value !== undefined));
      batch.set(itemDocument(listaId, operation.id), { ...data, _deleted: removedIds.includes(operation.id) }, { merge: true });
    }
    await withTimeout(batch.commit(), 10000);
  }
  return true;
}

export function startListasSync(): () => void {
  syncUsers++;
  void initialize().then(() => { if (syncUsers) startRealtime(); }).catch(() => {});
  return () => {
    syncUsers--;
    if (!syncUsers && !listeners.size) stopRealtime();
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
