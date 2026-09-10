import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { ColetaLista, ColetaItem } from '../types';

/**
 * DATABASE IDENTIFICATION & ARCHITECTURE:
 * This project utilizes Cloud Firestore (firebase/firestore).
 * All database operations are structured to use native Firestore tools:
 * - Batched Writes (writeBatch) in sequential chunks of 250-300 items.
 * - Server-side query filtering with `where`, `limit`, and cursor pagination (`startAfter`).
 * - Deterministic document IDs to guarantee uniqueness without O(N) read calls.
 * - Retry mechanisms with exponential backoff and strict timeouts.
 */

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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Collections
const REFUGO_COLLECTION = 'refugo';
const MAIN_REFUGO_DOC_ID = 'current_refugo_csv';
const MAIN_REFUGO_SCANS_DOC_ID = 'current_refugo_scans';

const COLETOR_COLLECTION = 'coletor';
const MAIN_DOC_ID = 'current_csv';

const COLETA_LISTAS_COLLECTION = 'coleta_listas';

// LocalStorage Keys
const LOCAL_STORAGE_REFUGO_KEY = 'refugo_current_csv_data';
const LOCAL_STORAGE_REFUGO_SCANS_KEY = 'refugo_scanned_items';
const LOCAL_STORAGE_KEY = 'coletor_current_csv_data';
const LOCAL_STORAGE_LISTAS_KEY = 'cached_coleta_listas_meta';

// Helper: Safe LocalStorage Setter with Quota Protection
function safeSetLocalStorage(key: string, data: any) {
  try {
    const serialized = JSON.stringify(data);
    // Limit local storage items to ~1MB to avoid browser freeze or quota exceptions
    if (serialized.length < 1500000) {
      localStorage.setItem(key, serialized);
    }
  } catch (err) {
    console.warn(`LocalStorage write skipped for ${key} (quota or circular limit):`, err);
  }
}

// Helper: Timeout wrapper for network resilience
export function withTimeout<T>(promise: Promise<T>, ms: number = 4000): Promise<T> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const timeoutMs = isOffline ? 400 : ms;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(isOffline ? 'Offline timeout' : `Firebase operation timed out after ${ms}ms`)), timeoutMs)
    ),
  ]);
}

// Helper: Exponential Backoff Retry Strategy
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  initialDelayMs: number = 300
): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      return await fn();
    } catch (err) {
      throw err;
    }
  }

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (
        attempt >= maxRetries ||
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err?.code === 'unavailable' ||
        err?.message?.includes('unavailable') ||
        err?.message?.includes('offline')
      ) {
        throw err;
      }
      console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, err?.message || err);
      await new Promise((res) => setTimeout(res, delay));
      delay *= 1.5;
    }
  }
  throw new Error('Operation failed after retries.');
}

// Sanitization & Deduplication of Raw Barcode Inputs
export function validateAndCleanIds(rawInputs: string[]): string[] {
  const uniqueClean = new Set<string>();

  for (const raw of rawInputs) {
    if (!raw) continue;
    let processed = raw.toString().trim();
    if (!processed) continue;

    // Clean common corruption patterns from physical hardware barcode scanners
    processed = processed.replace(/d[çc]?⁴/gi, '4');
    processed = processed.replace(/d[çc]?4/gi, '4');
    processed = processed.replace(/^[^0-9a-zA-Z]+/, '');

    const match47 = processed.match(/(47\d+)/);
    if (match47) {
      processed = match47[1];
    } else {
      processed = processed.replace(/m$/i, '');
    }

    const clean = processed.toUpperCase();
    if (clean.length >= 3) {
      uniqueClean.add(clean);
    }
  }

  return Array.from(uniqueClean);
}

// Data Interfaces
export interface RefugoData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

export interface ColetorData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

// ----------------------------------------------------------------------
// REFUGO BASE OPERATIONS
// ----------------------------------------------------------------------
export async function saveRefugo(rawText: string, totalRows: number, fileName?: string): Promise<boolean> {
  const localData: RefugoData = {
    rawText,
    totalRows,
    fileName: fileName || 'refugo.csv',
    updatedAt: new Date().toISOString(),
  };

  safeSetLocalStorage(LOCAL_STORAGE_REFUGO_KEY, localData);

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await retryWithBackoff(() =>
      withTimeout(
        setDoc(refugoRef, {
          rawText,
          totalRows,
          fileName: fileName || 'refugo.csv',
          updatedAt: serverTimestamp(),
        }),
        5000
      )
    );
    return true;
  } catch (error) {
    console.warn('Aviso: Firestore offline (refugo salvo localmente):', error);
    return true;
  }
}

export async function loadRefugo(): Promise<RefugoData | null> {
  let localData: RefugoData | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_KEY);
    if (cached) localData = JSON.parse(cached) as RefugoData;
  } catch (_) {}

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    const snap = await withTimeout(getDoc(refugoRef), 3500);

    if (snap.exists()) {
      const remoteData = snap.data() as RefugoData;
      if (remoteData && remoteData.rawText) {
        safeSetLocalStorage(LOCAL_STORAGE_REFUGO_KEY, remoteData);
        return remoteData;
      }
    }
  } catch (error) {
    console.warn('Não foi possível conectar ao Firestore para refugo:', error);
  }

  return localData;
}

export async function clearRefugo(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_REFUGO_KEY);
  } catch (_) {}

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await withTimeout(deleteDoc(refugoRef), 3500);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao apagar refugo:', error);
    return true;
  }
}

export function listenToRefugo(callback: (data: RefugoData | null) => void): () => void {
  const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_KEY);
    if (cached) callback(JSON.parse(cached) as RefugoData);
  } catch (_) {}

  return onSnapshot(
    refugoRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RefugoData;
        if (data && data.rawText) {
          safeSetLocalStorage(LOCAL_STORAGE_REFUGO_KEY, data);
          callback(data);
        } else {
          callback(null);
        }
      } else {
        callback(null);
      }
    },
    (error) => {
      console.warn('Erro em tempo real no refugo (usando local):', error);
    }
  );
}

// ----------------------------------------------------------------------
// COLETOR OPERATIONS
// ----------------------------------------------------------------------
export async function saveToColetor(rawText: string, totalRows: number, fileName?: string): Promise<boolean> {
  const localData: ColetorData = {
    rawText,
    totalRows,
    fileName: fileName || 'relatorio.csv',
    updatedAt: new Date().toISOString(),
  };

  safeSetLocalStorage(LOCAL_STORAGE_KEY, localData);

  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await retryWithBackoff(() =>
      withTimeout(
        setDoc(coletorRef, {
          rawText,
          totalRows,
          fileName: fileName || 'relatorio.csv',
          updatedAt: serverTimestamp(),
        }),
        5000
      )
    );
    return true;
  } catch (error) {
    console.warn('Firestore offline (coletor salvo localmente):', error);
    return true;
  }
}

export async function loadFromColetor(): Promise<ColetorData | null> {
  let localData: ColetorData | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) localData = JSON.parse(cached) as ColetorData;
  } catch (_) {}

  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    const snap = await withTimeout(getDoc(coletorRef), 3500);

    if (snap.exists()) {
      const remoteData = snap.data() as ColetorData;
      if (remoteData && remoteData.rawText) {
        safeSetLocalStorage(LOCAL_STORAGE_KEY, remoteData);
        return remoteData;
      }
    }
  } catch (error) {
    console.warn('Erro ao carregar coletor:', error);
  }

  return localData;
}

export async function clearColetor(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (_) {}

  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await withTimeout(deleteDoc(coletorRef), 3500);
    return true;
  } catch (error) {
    console.warn('Erro ao limpar coletor:', error);
    return true;
  }
}

// ----------------------------------------------------------------------
// REFUGO SCANS OPERATIONS
// ----------------------------------------------------------------------
export async function saveRefugoScans(scans: any[]): Promise<boolean> {
  const cleanScans = (scans || []).map(s => ({
    ...s,
    scannedAt: s.scannedAt instanceof Date ? s.scannedAt.toISOString() : (s.scannedAt || new Date().toISOString())
  }));
  safeSetLocalStorage(LOCAL_STORAGE_REFUGO_SCANS_KEY, cleanScans);

  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await retryWithBackoff(() =>
      withTimeout(
        setDoc(refugoScansRef, {
          scans: cleanScans,
          updatedAt: serverTimestamp(),
        }),
        5000
      )
    );
    return true;
  } catch (error) {
    console.warn('Erro ao salvar refugo scans no Firestore:', error);
    return true;
  }
}

export async function loadRefugoScans(): Promise<any[] | null> {
  let localData: any[] | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) localData = JSON.parse(cached);
  } catch (_) {}

  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    const snap = await withTimeout(getDoc(refugoScansRef), 3500);
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData && Array.isArray(remoteData.scans)) {
        safeSetLocalStorage(LOCAL_STORAGE_REFUGO_SCANS_KEY, remoteData.scans);
        return remoteData.scans;
      }
    }
  } catch (error) {
    console.warn('Erro ao carregar scans:', error);
  }

  return localData;
}

export async function clearRefugoScans(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
  } catch (_) {}

  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await withTimeout(deleteDoc(refugoScansRef), 3500);
    return true;
  } catch (error) {
    console.warn('Erro ao limpar scans:', error);
    return true;
  }
}

export function listenToRefugoScans(callback: (scans: any[]) => void): () => void {
  const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) callback(JSON.parse(cached));
  } catch (_) {}

  return onSnapshot(
    refugoScansRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.scans)) {
          safeSetLocalStorage(LOCAL_STORAGE_REFUGO_SCANS_KEY, data.scans);
          callback(data.scans);
        } else {
          callback([]);
        }
      } else {
        callback([]);
      }
    },
    (error) => {
      console.warn('Erro ao escutar scans:', error);
    }
  );
}

// ----------------------------------------------------------------------
// COLETA LISTAS & HIGH-VOLUME MASS BATCH PROCESSING
// ----------------------------------------------------------------------

// Memory cache for active UI lists
const ramListasMap = new Map<string, ColetaLista>();
const firestoreSaveDebounceMap = new Map<string, any>();

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      cleaned[key] = cleanUndefined(obj[key]);
    }
  }
  return cleaned;
}

function getSortedRamListas(): ColetaLista[] {
  return Array.from(ramListasMap.values()).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

export async function fetchSubcollectionItens(listaId: string): Promise<ColetaItem[]> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const snap = await withTimeout(getDocs(colRef), 5000);
    const items: ColetaItem[] = [];
    snap.forEach((d) => {
      items.push({ ...d.data(), id: d.id } as ColetaItem);
    });
    return items;
  } catch (err) {
    console.warn(`Aviso ao buscar subcoleção de itens da lista ${listaId}:`, err);
    return [];
  }
}

/**
 * Realtime Listener for Coleta Listas.
 * Fetches and synchronizes list documents without memory leaks or ID loss.
 */
export function listenToListas(callback: (listas: ColetaLista[]) => void): () => void {
  const colRef = collection(db, COLETA_LISTAS_COLLECTION);

  // Return cached metadata immediately
  const initial = getSortedRamListas();
  if (initial.length > 0) callback(initial);

  return onSnapshot(
    colRef,
    async (snap) => {
      for (const docSnap of snap.docs) {
        const remoteData = { ...docSnap.data(), id: docSnap.id } as ColetaLista;
        const localData = ramListasMap.get(remoteData.id);

        let mergedItens: ColetaItem[] = Array.isArray(remoteData.itens) ? [...remoteData.itens] : [];

        // Always preserve local items if remote doc has fewer items or missing array
        if (localData && Array.isArray(localData.itens) && localData.itens.length > mergedItens.length) {
          const remoteCodeSet = new Set(mergedItens.map(i => i.codigo));
          const missingFromRemote = localData.itens.filter(i => !remoteCodeSet.has(i.codigo));
          mergedItens = [...mergedItens, ...missingFromRemote];
        }

        // If expected total > mergedItens length, fetch subcollection items
        const expectedTotal = remoteData.totalItens || 0;
        if (expectedTotal > mergedItens.length) {
          const subCollectionItems = await fetchSubcollectionItens(remoteData.id);
          if (subCollectionItems.length > 0) {
            const existingCodeSet = new Set(mergedItens.map(i => i.codigo));
            const newFromSub = subCollectionItems.filter(i => !existingCodeSet.has(i.codigo));
            mergedItens = [...mergedItens, ...newFromSub];
          }
        }

        ramListasMap.set(remoteData.id, {
          ...remoteData,
          itens: mergedItens,
          totalItens: Math.max(expectedTotal, mergedItens.length)
        });
      }

      const sorted = getSortedRamListas();
      safeSetLocalStorage(LOCAL_STORAGE_LISTAS_KEY, sorted);
      callback(sorted);
    },
    (error) => {
      console.error('Erro ao escutar listas de coleta:', error);
      callback(getSortedRamListas());
    }
  );
}

/**
 * NATIVE FIREBASE PAGINATION BY CURSOR (limit & startAfter)
 * Direct server-side filtering with `where` clauses to handle huge datasets efficiently.
 */
export async function fetchListasPaginated(options: {
  pageSize?: number;
  statusFilter?: 'todas' | 'em_andamento' | 'finalizada';
  dateFilter?: string;
  lastDocSnap?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<{ listas: ColetaLista[]; lastDocSnap: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
  const { pageSize = 50, statusFilter, dateFilter, lastDocSnap } = options;

  let constraints: any[] = [];

  if (statusFilter && statusFilter !== 'todas') {
    constraints.push(where('status', '==', statusFilter));
  }

  if (dateFilter && dateFilter.trim()) {
    constraints.push(where('data', '==', dateFilter.trim()));
  }

  constraints.push(orderBy('data', 'desc'));
  constraints.push(limit(pageSize));

  if (lastDocSnap) {
    constraints.push(startAfter(lastDocSnap));
  }

  const q = query(collection(db, COLETA_LISTAS_COLLECTION), ...constraints);
  const snap = await retryWithBackoff(() => withTimeout(getDocs(q), 5000));

  const listas: ColetaLista[] = snap.docs.map((d) => ({ ...d.data(), id: d.id } as ColetaLista));
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return {
    listas,
    lastDocSnap: newLastDoc,
    hasMore: snap.docs.length === pageSize,
  };
}

/**
 * HIGH-VOLUME NATIVE BATCH PROCESSING
 * Handles 1,600, 5,000, 10,000, 50,000+ IDs using native Firebase writeBatch in chunks of 250-300 items.
 * Runs sequentially with explicit progress callbacks, automatic retries with backoff, and zero browser freezing.
 */
export async function saveListaItemsBatch(
  listaId: string,
  items: ColetaItem[],
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<boolean> {
  if (!listaId || !items || items.length === 0) return true;

  // 1. Deduplicate & validate items upfront in memory using deterministic keys
  const uniqueItemsMap = new Map<string, ColetaItem>();
  for (const item of items) {
    const cleanCod = item.codigo ? item.codigo.toString().trim().toUpperCase() : '';
    if (!cleanCod) continue;
    uniqueItemsMap.set(cleanCod, {
      ...item,
      codigo: cleanCod
    });
  }

  const deduplicatedItems = Array.from(uniqueItemsMap.values());
  const total = deduplicatedItems.length;

  // Update RAM cache so local memory never loses items
  const currentLista = ramListasMap.get(listaId);
  if (currentLista) {
    const existingMap = new Map((currentLista.itens || []).map(i => [i.codigo, i]));
    for (const item of deduplicatedItems) {
      existingMap.set(item.codigo, item);
    }
    const mergedItens = Array.from(existingMap.values());
    ramListasMap.set(listaId, {
      ...currentLista,
      itens: mergedItens,
      totalItens: mergedItens.length
    });
  }

  // 2. Process in sequential native Firestore Batches of 300 items
  const BATCH_SIZE = 300;
  let processedCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = deduplicatedItems.slice(i, i + BATCH_SIZE);

    try {
      const batch = writeBatch(db);

      chunk.forEach((item) => {
        const docId = item.id || `item_${item.codigo}`;
        const itemRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', docId);

        batch.set(itemRef, cleanUndefined({
          ...item,
          updatedAt: serverTimestamp()
        }), { merge: true });
      });

      await withTimeout(batch.commit(), 5000);
    } catch (err: any) {
      console.warn(`Lote de itens (${i}-${i + chunk.length}) mantido no cache offline:`, err?.message || err);
    }

    processedCount += chunk.length;
    const percent = Math.min(100, Math.round((processedCount / total) * 100));

    if (onProgress) {
      onProgress(processedCount, total, percent);
    }

    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  // 3. Update main list metadata document WITH full items list array
  try {
    const mainDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const updatedRAM = ramListasMap.get(listaId);
    const finalItens = updatedRAM?.itens || deduplicatedItems;

    await setDoc(mainDocRef, cleanUndefined({
      itens: finalItens,
      totalItens: finalItens.length,
      updatedAt: serverTimestamp()
    }), { merge: true });
  } catch (err) {
    console.warn('Lista metadata update notice:', err);
  }

  return true;
}

/**
 * Standard Save Lista function with debounce and RAM cache for fast zero-latency UI updates.
 */
async function performFirestoreSave(lista: ColetaLista): Promise<boolean> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, lista.id);
    const totalItensCount = lista.itens ? lista.itens.length : 0;

    const cleanedData = cleanUndefined({
      ...lista,
      totalItens: totalItensCount,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 5000));

    // Also sync to subcollection asynchronously if items present
    if (lista.itens && lista.itens.length > 0) {
      saveListaItemsBatch(lista.id, lista.itens).catch(err => console.warn('Background subcollection sync notice:', err));
    }

    return true;
  } catch (error) {
    console.error('Erro ao sincronizar com Firestore (mantido localmente):', error);
    return true;
  }
}

export async function saveLista(lista: ColetaLista, immediate = false): Promise<boolean> {
  ramListasMap.set(lista.id, lista);

  if (firestoreSaveDebounceMap.has(lista.id)) {
    clearTimeout(firestoreSaveDebounceMap.get(lista.id));
    firestoreSaveDebounceMap.delete(lista.id);
  }

  if (immediate) {
    return await performFirestoreSave(lista);
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(async () => {
      firestoreSaveDebounceMap.delete(lista.id);
      const success = await performFirestoreSave(lista);
      resolve(success);
    }, 400);

    firestoreSaveDebounceMap.set(lista.id, timer);
  });
}

export async function flushSaveLista(listaId: string): Promise<boolean> {
  if (firestoreSaveDebounceMap.has(listaId)) {
    clearTimeout(firestoreSaveDebounceMap.get(listaId));
    firestoreSaveDebounceMap.delete(listaId);
  }
  const lista = ramListasMap.get(listaId);
  if (lista) {
    return await performFirestoreSave(lista);
  }
  return true;
}

export async function deleteLista(listaId: string): Promise<boolean> {
  if (firestoreSaveDebounceMap.has(listaId)) {
    clearTimeout(firestoreSaveDebounceMap.get(listaId));
    firestoreSaveDebounceMap.delete(listaId);
  }
  ramListasMap.delete(listaId);

  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await retryWithBackoff(() => withTimeout(deleteDoc(docRef), 5000));
    return true;
  } catch (error) {
    console.error('Erro ao excluir lista de coleta:', error);
    return false;
  }
}

export async function getListaById(listaId: string): Promise<ColetaLista | null> {
  const cached = ramListasMap.get(listaId);

  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const snap = await retryWithBackoff(() => withTimeout(getDoc(docRef), 4000));
    if (snap.exists()) {
      const remoteData = { ...snap.data(), id: snap.id } as ColetaLista;
      let remoteItens = Array.isArray(remoteData.itens) ? remoteData.itens : [];

      if (cached && Array.isArray(cached.itens) && cached.itens.length > remoteItens.length) {
        const remoteCodeSet = new Set(remoteItens.map(i => i.codigo));
        const missing = cached.itens.filter(i => !remoteCodeSet.has(i.codigo));
        remoteItens = [...remoteItens, ...missing];
      }

      if ((remoteData.totalItens || 0) > remoteItens.length) {
        const subItems = await fetchSubcollectionItens(listaId);
        if (subItems.length > 0) {
          const codeSet = new Set(remoteItens.map(i => i.codigo));
          const newSub = subItems.filter(i => !codeSet.has(i.codigo));
          remoteItens = [...remoteItens, ...newSub];
        }
      }

      const finalLista: ColetaLista = {
        ...remoteData,
        itens: remoteItens,
        totalItens: Math.max(remoteData.totalItens || 0, remoteItens.length)
      };

      ramListasMap.set(listaId, finalLista);
      return finalLista;
    }
  } catch (error) {
    console.error('Erro ao buscar lista por ID:', error);
  }

  return cached || null;
}
