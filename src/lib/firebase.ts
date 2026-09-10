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
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Firebase operation timed out after ${ms}ms`)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

// Helper: Exponential Backoff Retry Strategy
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, err);
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
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

export function listenToColetor(callback: (data: ColetorData | null) => void): () => void {
  let cached: ColetorData | null = null;
  try { cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || 'null'); } catch {}
  callback(cached);
  return onSnapshot(doc(db, COLETOR_COLLECTION, MAIN_DOC_ID), snapshot => {
    const fromCache = snapshot.metadata.fromCache;
    if (!snapshot.exists() && fromCache) return;
    const data = snapshot.exists() ? snapshot.data() as ColetorData : null;
    if (data) safeSetLocalStorage(LOCAL_STORAGE_KEY, data);
    else { try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch {} }
    callback(data);
  }, error => console.error('Erro ao sincronizar base de consulta:', error));
}

// ----------------------------------------------------------------------
// REFUGO SCANS OPERATIONS
// ----------------------------------------------------------------------
export async function saveRefugoScans(scans: any[]): Promise<boolean> {
  safeSetLocalStorage(LOCAL_STORAGE_REFUGO_SCANS_KEY, scans);

  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await retryWithBackoff(() =>
      withTimeout(
        setDoc(refugoScansRef, {
          scans,
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
// COLETA LISTAS: durable item journal and shared realtime listeners.
export { listenToListas, saveLista, saveListaItemsBatch, flushSaveLista, deleteLista, getListaById, fetchListasPaginated, startListasSync } from './coletaSync';
