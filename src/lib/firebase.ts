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
  persistentMultipleTabManager
} from 'firebase/firestore';

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

const REFUGO_COLLECTION = 'refugo';
const MAIN_REFUGO_DOC_ID = 'current_refugo_csv';
const MAIN_REFUGO_SCANS_DOC_ID = 'current_refugo_scans';
const LOCAL_STORAGE_REFUGO_KEY = 'refugo_current_csv_data';
const LOCAL_STORAGE_REFUGO_SCANS_KEY = 'refugo_scanned_items';

const COLETOR_COLLECTION = 'coletor';
const MAIN_DOC_ID = 'current_csv';
const LOCAL_STORAGE_KEY = 'coletor_current_csv_data';

const COLETA_LISTAS_COLLECTION = 'coleta_listas';

export interface RefugoData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

export async function saveRefugo(rawText: string, totalRows: number, fileName?: string): Promise<boolean> {
  const localData: RefugoData = {
    rawText,
    totalRows,
    fileName: fileName || 'refugo.csv',
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_REFUGO_KEY, JSON.stringify(localData));
  } catch (err) {
    console.warn('Falha ao salvar refugo no localStorage:', err);
  }

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await withTimeout(
      setDoc(refugoRef, {
        rawText,
        totalRows,
        fileName: fileName || 'refugo.csv',
        updatedAt: serverTimestamp(),
      }),
      3500
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
    if (cached) {
      localData = JSON.parse(cached) as RefugoData;
    }
  } catch (err) {}

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    const snap = await withTimeout(getDoc(refugoRef), 3000);

    if (snap.exists()) {
      const remoteData = snap.data() as RefugoData;
      if (remoteData && remoteData.rawText) {
        try {
          localStorage.setItem(LOCAL_STORAGE_REFUGO_KEY, JSON.stringify(remoteData));
        } catch (_) {}
        return remoteData;
      }
    } else {
      try { localStorage.removeItem(LOCAL_STORAGE_REFUGO_KEY); } catch (_) {}
      return null;
    }
  } catch (error) {
    console.warn('Não foi possível conectar ao Firestore para refugo:', error);
  }

  return localData;
}

export async function clearRefugo(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_REFUGO_KEY);
  } catch (err) {}

  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await withTimeout(deleteDoc(refugoRef), 3000);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao apagar refugo:', error);
    return true;
  }
}

export function listenToRefugo(callback: (data: RefugoData | null) => void): () => void {
  const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
  
  // Immediately check local storage cache first
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_KEY);
    if (cached) {
      callback(JSON.parse(cached) as RefugoData);
    }
  } catch (_) {}

  const unsubscribe = onSnapshot(refugoRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as RefugoData;
      if (data && data.rawText) {
        try {
          localStorage.setItem(LOCAL_STORAGE_REFUGO_KEY, JSON.stringify(data));
        } catch (_) {}
        callback(data);
      } else {
        try { localStorage.removeItem(LOCAL_STORAGE_REFUGO_KEY); } catch (_) {}
        callback(null);
      }
    } else {
      try { localStorage.removeItem(LOCAL_STORAGE_REFUGO_KEY); } catch (_) {}
      callback(null); // document was deleted or doesn't exist
    }
  }, (error) => {
    console.warn('Erro ao escutar refugo em tempo real (fallback local):', error);
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_KEY);
      callback(cached ? (JSON.parse(cached) as RefugoData) : null);
    } catch (_) {
      callback(null);
    }
  });

  return unsubscribe;
}

export interface ColetorData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

/**
 * Helper to prevent Firebase calls from hanging indefinitely on network issues
 */
function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Firebase operation timed out')), ms)
    ),
  ]);
}

/**
 * Save CSV raw text and metadata to Firebase Firestore collection 'coletor'
 * and syncs with localStorage as instant backup.
 */
export async function saveToColetor(rawText: string, totalRows: number, fileName?: string): Promise<boolean> {
  const localData: ColetorData = {
    rawText,
    totalRows,
    fileName: fileName || 'relatorio.csv',
    updatedAt: new Date().toISOString(),
  };

  // Always persist locally first for instant offline availability
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localData));
  } catch (err) {
    console.warn('Falha ao salvar no localStorage:', err);
  }

  // Attempt Firestore sync
  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await withTimeout(
      setDoc(coletorRef, {
        rawText,
        totalRows,
        fileName: fileName || 'relatorio.csv',
        updatedAt: serverTimestamp(),
      }),
      3500
    );
    return true;
  } catch (error) {
    console.warn('Aviso: Firestore offline ou indisponível (dados salvos localmente):', error);
    return true; // Local save succeeded
  }
}

/**
 * Load saved CSV data from Firebase Firestore collection 'coletor'
 * with local cache fallback for instant load and offline resilience.
 */
export async function loadFromColetor(): Promise<ColetorData | null> {
  // 1. Try reading from LocalStorage first for instant responsiveness
  let localData: ColetorData | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      localData = JSON.parse(cached) as ColetorData;
    }
  } catch (err) {
    console.warn('Erro ao ler cache local:', err);
  }

  // 2. Attempt fetching latest version from Firestore with timeout
  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    const snap = await withTimeout(getDoc(coletorRef), 3000);

    if (snap.exists()) {
      const remoteData = snap.data() as ColetorData;
      if (remoteData && remoteData.rawText) {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remoteData));
        } catch (_) {}
        return remoteData;
      }
    }
  } catch (error) {
    console.warn('Não foi possível conectar ao Firestore (usando cache local):', error);
  }

  return localData;
}

/**
 * Clear/Delete CSV data from Firebase Firestore collection 'coletor' and LocalStorage.
 */
export async function clearColetor(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (err) {
    console.warn('Erro ao limpar localStorage:', err);
  }

  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await withTimeout(deleteDoc(coletorRef), 3000);

    const querySnap = await withTimeout(getDocs(collection(db, COLETOR_COLLECTION)), 3000);
    if (!querySnap.empty) {
      const batch = writeBatch(db);
      querySnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await withTimeout(batch.commit(), 3000);
    }
    return true;
  } catch (error) {
    console.warn('Firestore offline ao apagar (dados limpos localmente):', error);
    return true;
  }
}


let refugoScansDebounceTimer: any = null;
let pendingScansData: any[] | null = null;

export async function saveRefugoScans(scans: any[], immediate = false): Promise<boolean> {
  pendingScansData = scans;
  
  if (refugoScansDebounceTimer) {
    clearTimeout(refugoScansDebounceTimer);
    refugoScansDebounceTimer = null;
  }

  const doSave = async (dataToSave: any[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(dataToSave));
    } catch (err) {
      console.warn('Falha ao salvar scans localmente:', err);
    }
    
    try {
      const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
      await withTimeout(
        setDoc(refugoScansRef, {
          scans: dataToSave,
          updatedAt: serverTimestamp(),
        }),
        3500
      );
      return true;
    } catch (error) {
      console.warn('Aviso: Firestore offline (scans salvos localmente):', error);
      return true;
    }
  };

  if (immediate) {
    return await doSave(scans);
  }

  return new Promise<boolean>((resolve) => {
    refugoScansDebounceTimer = setTimeout(async () => {
      refugoScansDebounceTimer = null;
      if (pendingScansData) {
        const res = await doSave(pendingScansData);
        resolve(res);
      } else {
        resolve(true);
      }
    }, 350);
  });
}

export async function loadRefugoScans(): Promise<any[] | null> {
  let localData: any[] | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch (err) {}
  
  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    const snap = await withTimeout(getDoc(refugoScansRef), 3000);
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData && Array.isArray(remoteData.scans)) {
        try {
          localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(remoteData.scans));
        } catch (_) {}
        return remoteData.scans;
      } else {
        try { localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify([])); } catch (_) {}
        return [];
      }
    } else {
      try { localStorage.removeItem(LOCAL_STORAGE_REFUGO_SCANS_KEY); } catch (_) {}
      return [];
    }
  } catch (error) {
    console.warn('Não foi possível conectar ao Firestore para scans:', error);
  }
  return localData;
}

export async function clearRefugoScans(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
  } catch (err) {}
  
  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await withTimeout(deleteDoc(refugoScansRef), 3000);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao apagar scans:', error);
    return true;
  }
}

export function listenToRefugoScans(callback: (scans: any[]) => void): () => void {
  const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
  
  // Immediately check local storage cache first
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) {
      callback(JSON.parse(cached));
    }
  } catch (_) {}

  // Real-time listener
  const unsubscribe = onSnapshot(refugoScansRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.scans)) {
        // Sync local storage on update
        try {
          localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(data.scans));
        } catch (_) {}
        callback(data.scans);
      } else {
        try { localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify([])); } catch (_) {}
        callback([]);
      }
    } else {
      try { localStorage.removeItem(LOCAL_STORAGE_REFUGO_SCANS_KEY); } catch (_) {}
      callback([]); // document was deleted or doesn't exist
    }
  }, (error) => {
    console.warn('Erro ao escutar scans em tempo real (fallback local):', error);
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
      callback(cached ? JSON.parse(cached) : []);
    } catch (_) {
      callback([]);
    }
  });

  return unsubscribe;
}

/**
 * Persistence for Coleta Listas with high-performance In-Memory RAM Caching,
 * instant local storage backup, and debounced Firestore synchronization.
 */
import { ColetaLista } from '../types';

const LOCAL_STORAGE_LISTAS_KEY = 'cached_coleta_listas';
const LOCAL_STORAGE_LISTA_PREFIX = 'cached_coleta_lista_';

// 🚀 In-Memory RAM Cache Map for instant zero-latency access
const ramListasMap = new Map<string, ColetaLista>();
const firestoreSaveDebounceMap = new Map<string, any>();

export function getListaSortTimestamp(lista: ColetaLista): number {
  if (!lista) return 0;

  // 1. Check createdAt (ISO string ou timestamp numérico)
  if (lista.createdAt) {
    const t = new Date(lista.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 2. Check updatedAt (pode ser Firestore Timestamp, string ou number)
  const anyLista = lista as any;
  if (anyLista.updatedAt) {
    if (typeof anyLista.updatedAt?.toMillis === 'function') {
      return anyLista.updatedAt.toMillis();
    }
    if (typeof anyLista.updatedAt?.seconds === 'number') {
      return anyLista.updatedAt.seconds * 1000;
    }
    const t = new Date(anyLista.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 3. Extrair timestamp em milissegundos do ID (ex: "lista-1726190000000")
  if (lista.id) {
    const match = lista.id.match(/\d{12,}/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > 1000000000000) return num;
    }
  }

  // 4. Parse da data ("DD/MM/YYYY" ou "YYYY-MM-DD")
  if (lista.data) {
    if (lista.data.includes('/')) {
      const parts = lista.data.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const t = new Date(year, month, day).getTime();
        if (!isNaN(t)) return t;
      }
    } else if (lista.data.includes('-')) {
      const t = new Date(lista.data).getTime();
      if (!isNaN(t)) return t;
    }
  }

  return 0;
}

export function getSortedRamListas(): ColetaLista[] {
  const arr = Array.from(ramListasMap.values());
  return arr.sort((a, b) => {
    const tA = getListaSortTimestamp(a);
    const tB = getListaSortTimestamp(b);
    if (tA !== tB) return tB - tA; // Mais recente no topo!
    return (b.id || '').localeCompare(a.id || '');
  });
}

// Initialize RAM cache from LocalStorage on module load
try {
  const cachedRaw = localStorage.getItem(LOCAL_STORAGE_LISTAS_KEY);
  if (cachedRaw) {
    const parsed = JSON.parse(cachedRaw) as ColetaLista[];
    if (Array.isArray(parsed)) {
      parsed.forEach(l => {
        if (l && l.id) ramListasMap.set(l.id, l);
      });
    }
  }
} catch (e) {
  console.warn('Erro ao inicializar RAM cache de listas:', e);
}

let localStoragePersistTimer: any = null;

export function persistRamToLocalStorageNow() {
  if (localStoragePersistTimer) {
    clearTimeout(localStoragePersistTimer);
    localStoragePersistTimer = null;
  }
  try {
    const sorted = getSortedRamListas();
    localStorage.setItem(LOCAL_STORAGE_LISTAS_KEY, JSON.stringify(sorted));
    ramListasMap.forEach((lista, id) => {
      localStorage.setItem(`${LOCAL_STORAGE_LISTA_PREFIX}${id}`, JSON.stringify(lista));
    });
  } catch (err) {
    console.warn('Erro ao salvar no LocalStorage:', err);
  }
}

function persistRamToLocalStorageAsync() {
  if (localStoragePersistTimer) {
    clearTimeout(localStoragePersistTimer);
  }
  localStoragePersistTimer = setTimeout(() => {
    localStoragePersistTimer = null;
    persistRamToLocalStorageNow();
  }, 500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    persistRamToLocalStorageNow();
  });
}

export function listenToListas(callback: (listas: ColetaLista[]) => void): () => void {
  const colRef = collection(db, COLETA_LISTAS_COLLECTION);
  
  // 1. Emissão imediata do cache em RAM/LocalStorage para render instantâneo 0ms
  const initial = getSortedRamListas();
  if (initial.length > 0) {
    callback(initial);
  }

  // 2. Listener em tempo real com sincronização de exclusão entre múltiplos usuários
  return onSnapshot(colRef, (snap) => {
    // A) Processar remoções explicitamente notificadas pelo snapshot
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        const removedId = change.doc.id;
        ramListasMap.delete(removedId);
        try {
          localStorage.removeItem(`${LOCAL_STORAGE_LISTA_PREFIX}${removedId}`);
        } catch (_) {}
      }
    });

    // B) Coletar todos os IDs ativos do Firestore no momento
    const remoteDocIds = new Set<string>();

    snap.forEach((docSnap) => {
      remoteDocIds.add(docSnap.id);
      const remoteData = { ...docSnap.data(), id: docSnap.id } as ColetaLista;
      const localData = ramListasMap.get(remoteData.id);

      // Preservar itens locais apenas se houver bipagem rápida pendente em debounce
      if (localData && firestoreSaveDebounceMap.has(remoteData.id)) {
        if (localData.itens && remoteData.itens && localData.itens.length > remoteData.itens.length) {
          return; // Manter itens locais até o debounce persistir
        }
      }

      ramListasMap.set(remoteData.id, remoteData);
    });

    // C) Purgar da RAM e do LocalStorage qualquer lista que não exista mais no Firestore
    // (garante que listas excluídas por outro usuário sumam imediatamente)
    for (const id of Array.from(ramListasMap.keys())) {
      if (!remoteDocIds.has(id) && !firestoreSaveDebounceMap.has(id)) {
        ramListasMap.delete(id);
        try {
          localStorage.removeItem(`${LOCAL_STORAGE_LISTA_PREFIX}${id}`);
        } catch (_) {}
      }
    }

    const sorted = getSortedRamListas();
    persistRamToLocalStorageNow();
    callback(sorted);
  }, (error) => {
    console.error('Erro ao escutar listas de coleta:', error);
    callback(getSortedRamListas());
  });
}

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      cleaned[key] = cleanUndefined(obj[key]);
    }
  }
  return cleaned;
}

async function performFirestoreSave(lista: ColetaLista): Promise<boolean> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, lista.id);
    const cleanedData = cleanUndefined({
      ...lista,
      updatedAt: serverTimestamp(),
    });
    await setDoc(docRef, cleanedData, { merge: true });
    return true;
  } catch (error) {
    console.error('Erro ao sincronizar com Firestore (mantido no cache local):', error);
    return true;
  }
}

export async function saveLista(lista: ColetaLista, immediate = false): Promise<boolean> {
  // 1. Update In-Memory RAM Cache instantly (0ms UI latency)
  ramListasMap.set(lista.id, lista);
  persistRamToLocalStorageAsync();

  // Clear existing debounce timer if any
  if (firestoreSaveDebounceMap.has(lista.id)) {
    clearTimeout(firestoreSaveDebounceMap.get(lista.id));
    firestoreSaveDebounceMap.delete(lista.id);
  }

  if (immediate) {
    return await performFirestoreSave(lista);
  }

  // 2. Debounce Firestore sync by 400ms to batch rapid barcode scans
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
    localStorage.removeItem(`${LOCAL_STORAGE_LISTA_PREFIX}${listaId}`);
  } catch (_) {}
  persistRamToLocalStorageNow();

  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Erro ao excluir lista de coleta:', error);
    return false;
  }
}

export async function getListaById(listaId: string): Promise<ColetaLista | null> {
  if (ramListasMap.has(listaId)) {
    return ramListasMap.get(listaId)!;
  }

  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { ...snap.data(), id: snap.id } as ColetaLista;
      ramListasMap.set(listaId, data);
      persistRamToLocalStorageAsync();
      return data;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar lista por ID:', error);
    return null;
  }
}
