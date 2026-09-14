import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  collection,
  collectionGroup,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  increment,
  deleteField,
  QueryDocumentSnapshot,
  memoryLocalCache,
  setLogLevel
} from 'firebase/firestore';

// Silencia avisos internos de conectividade temporária do SDK do Firestore
try {
  setLogLevel('silent');
} catch (_) {}

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

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true
  });
} catch (_) {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

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
function withTimeout<T>(promise: Promise<T>, ms: number = 25000): Promise<T> {
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
 * Server-First Persistence for Coleta Listas:
 * The Firestore database is the single source of truth.
 * Lists store lightweight metadata; items/packets are stored in individual
 * documents in the subcollection `coleta_listas/{listaId}/itens/{itemId}`.
 * No operational localStorage, no operational IndexedDB, no massive RAM cache.
 */
import { ColetaLista, ColetaItem } from '../types';

function cleanDigits(val: string | undefined | null): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

export function cleanUndefined(obj: any): any {
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

export function getListaSortTimestamp(lista: ColetaLista): number {
  if (!lista) return 0;

  // 1. Check createdAt
  if (lista.createdAt) {
    if (typeof (lista.createdAt as any)?.toMillis === 'function') {
      return (lista.createdAt as any).toMillis();
    }
    const t = new Date(lista.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 2. Check updatedAt
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

  // 3. Extract timestamp from ID (e.g., "lista-1726190000000")
  if (lista.id) {
    const match = lista.id.match(/\d{12,}/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > 1000000000000) return num;
    }
  }

  // 4. Parse date string
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

/**
 * Escuta todas las listas (apenas metadados) em tempo real diretamente do Firestore.
 * Zero uso de LocalStorage ou cache em RAM como fonte.
 */
export function listenToListas(callback: (listas: ColetaLista[]) => void): () => void {
  const colRef = collection(db, COLETA_LISTAS_COLLECTION);
  
  return onSnapshot(colRef, (snap) => {
    const remoteListas: ColetaLista[] = snap.docs.map(docSnap => {
      const data = docSnap.data();
      const legacyItens = Array.isArray(data.itens) ? data.itens : [];
      const totalItens = typeof data.totalItens === 'number' ? data.totalItens : legacyItens.length;
      const totalValidados = typeof data.totalValidados === 'number' ? data.totalValidados : legacyItens.filter((i: any) => i.validado).length;

      return {
        ...data,
        id: docSnap.id,
        itens: legacyItens,
        totalItens,
        totalValidados
      } as ColetaLista;
    });

    remoteListas.sort((a, b) => {
      const tA = getListaSortTimestamp(a);
      const tB = getListaSortTimestamp(b);
      if (tA !== tB) return tB - tA;
      return (b.id || '').localeCompare(a.id || '');
    });

    callback(remoteListas);

    // Trigger background migration for legacy lists with inline array itens
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (Array.isArray(data.itens) && data.itens.length > 0 && data.migrationVersion !== 2) {
        migrateSingleLegacyLista(docSnap.id, data.itens).catch(err => {
          console.warn('Erro na migração em segundo plano da lista', docSnap.id, err);
        });
      }
    });
  }, (error) => {
    console.error('Erro ao escutar listas de coleta no Firestore:', error);
  });
}

/**
 * Escuta os itens de uma lista específica em tempo real (otimizado com limite de 1500 itens para ultra performance).
 */
export function listenToListaItens(listaId: string, callback: (itens: ColetaItem[]) => void): () => void {
  if (!listaId) return () => {};
  const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
  const q = query(colRef, orderBy('timestamp', 'desc'), limit(1500));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as ColetaItem));
    callback(items);
  }, (err) => {
    console.error('Erro ao escutar itens da lista:', err);
  });
}

/**
 * Busca uma vez todos os itens da subcoleção de uma lista.
 */
export async function getListaItensOnce(listaId: string): Promise<ColetaItem[]> {
  if (!listaId) return [];
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
  } catch (err) {
    console.error('Erro ao buscar itens da lista uma vez:', err);
    return [];
  }
}

/**
 * Escuta metadados de uma única lista em tempo real.
 */
export function listenToActiveLista(listaId: string, callback: (lista: ColetaLista | null) => void): () => void {
  if (!listaId) {
    callback(null);
    return () => {};
  }
  const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
  return onSnapshot(docRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data();
    const legacyItens = Array.isArray(data.itens) ? data.itens : [];
    callback({
      ...data,
      id: snap.id,
      itens: legacyItens,
      totalItens: typeof data.totalItens === 'number' ? data.totalItens : legacyItens.length,
      totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : legacyItens.filter((i: any) => i.validado).length
    } as ColetaLista);
  }, (err) => {
    console.warn('Erro ao escutar lista ativa:', err);
  });
}

/**
 * Busca metadados de uma lista diretamente do Firestore.
 */
export async function getListaById(listaId: string): Promise<ColetaLista | null> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const legacyItens = Array.isArray(data.itens) ? data.itens : [];
      return {
        ...data,
        id: snap.id,
        itens: legacyItens,
        totalItens: typeof data.totalItens === 'number' ? data.totalItens : legacyItens.length,
        totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : legacyItens.filter((i: any) => i.validado).length
      } as ColetaLista;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar lista por ID no servidor:', error);
    return null;
  }
}

/**
 * Salva metadados da lista no servidor de forma estritamente não-destrutiva.
 * NUNCA apaga itens da subcoleção de pacotes ao atualizar metadados.
 */
export async function saveLista(lista: Partial<ColetaLista> & { id: string }, immediate = false): Promise<boolean> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, lista.id);
    const { itens, ...metaData } = lista as any;

    const cleaned = cleanUndefined({
      ...metaData,
      updatedAt: serverTimestamp()
    });

    // Atualiza apenas os metadados do documento pai, sem tocar na subcoleção de itens
    await setDoc(docRef, cleaned, { merge: true });

    // Se itens foram passados explicitamente (lote inicial), adiciona sem apagar os existentes
    if (Array.isArray(itens) && itens.length > 0) {
      await addItemsBatchToLista(lista.id, itens);
    }

    return true;
  } catch (error) {
    console.error('Erro ao salvar metadados da lista no servidor:', error);
    return false;
  }
}

export async function saveListaMetadata(lista: Partial<ColetaLista> & { id: string }): Promise<boolean> {
  return saveLista(lista);
}

export async function flushSaveLista(listaId: string): Promise<boolean> {
  return true;
}

/**
 * Adiciona um único item na subcoleção `itens` do servidor e atualiza os contadores de metadados.
 * "O servidor é a única fonte da verdade. Servidor confirma, depois exibe."
 */
export async function addItemToLista(
  listaId: string,
  item: Omit<ColetaItem, 'id'> & { id?: string }
): Promise<ColetaItem> {
  const itemId = item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const itemDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', itemId);
  const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);

  const cleanCod = cleanDigits(item.codigo);
  const timestamp = item.timestamp || Date.now();

  const itemToSave: ColetaItem = {
    id: itemId,
    codigo: item.codigo,
    codigoClean: cleanCod,
    rota: item.rota || 'Sem Rota',
    saida: item.saida || 'Ciclo 2 - Saída PM',
    motivo: item.motivo || 'Pendente',
    scannedAt: item.scannedAt || new Date().toLocaleString('pt-BR'),
    responsavel: item.responsavel || 'Operador',
    grupoId: item.grupoId || undefined,
    validado: item.validado !== undefined ? item.validado : false,
    timestamp
  };

  // 1. Grava o documento individual do pacote no servidor
  await setDoc(itemDocRef, cleanUndefined(itemToSave));

  // 2. Atualiza contadores no documento pai no servidor
  const op = item.responsavel || 'Operador';
  const saida = item.saida || 'Ciclo 2 - Saída PM';
  const motivo = item.motivo || 'Pendente';

  const updatePayload: Record<string, any> = {
    totalItens: increment(1),
    updatedAt: serverTimestamp(),
    [`bipsPorOperador.${op}`]: increment(1),
    [`saidasCount.${saida}`]: increment(1),
    [`motivosCount.${motivo}`]: increment(1),
  };

  if (item.validado) {
    updatePayload.totalValidados = increment(1);
  }

  try {
    await updateDoc(listaDocRef, updatePayload);
  } catch (_) {
    await setDoc(listaDocRef, updatePayload, { merge: true });
  }

  return itemToSave;
}

/**
 * Atualiza um único item na subcoleção do servidor.
 */
export async function updateItemInLista(
  listaId: string,
  itemId: string,
  updates: Partial<ColetaItem>,
  prevItem?: Partial<ColetaItem>
): Promise<boolean> {
  try {
    const itemDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', itemId);
    const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);

    await updateDoc(itemDocRef, cleanUndefined({
      ...updates,
      updatedAt: serverTimestamp()
    }));

    // Sincroniza contadores agregados se motivo, saída ou validação foram alterados
    const metaUpdates: Record<string, any> = {
      updatedAt: serverTimestamp()
    };

    if (updates.validado !== undefined && prevItem?.validado !== undefined && updates.validado !== prevItem.validado) {
      metaUpdates.totalValidados = increment(updates.validado ? 1 : -1);
    }
    if (updates.motivo && prevItem?.motivo && updates.motivo !== prevItem.motivo) {
      metaUpdates[`motivosCount.${prevItem.motivo}`] = increment(-1);
      metaUpdates[`motivosCount.${updates.motivo}`] = increment(1);
    }
    if (updates.saida && prevItem?.saida && updates.saida !== prevItem.saida) {
      metaUpdates[`saidasCount.${prevItem.saida}`] = increment(-1);
      metaUpdates[`saidasCount.${updates.saida}`] = increment(1);
    }

    if (Object.keys(metaUpdates).length > 1) {
      try {
        await updateDoc(listaDocRef, metaUpdates);
      } catch (_) {}
    }

    return true;
  } catch (error) {
    console.error('Erro ao atualizar item na lista:', error);
    return false;
  }
}

/**
 * Exclui um único item do servidor e decrementa contadores.
 * "Excluir deve funcionar para itens fora da página atual."
 */
export async function deleteItemFromLista(
  listaId: string,
  itemId: string,
  itemData?: Partial<ColetaItem>
): Promise<boolean> {
  try {
    const itemDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', itemId);
    const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);

    let itemToDelete = itemData;
    if (!itemToDelete) {
      try {
        const snap = await getDoc(itemDocRef);
        if (snap.exists()) itemToDelete = snap.data() as ColetaItem;
      } catch (_) {}
    }

    // Exclui o documento no servidor
    await deleteDoc(itemDocRef);

    // Decrementa contadores no servidor
    const metaUpdates: Record<string, any> = {
      totalItens: increment(-1),
      updatedAt: serverTimestamp()
    };

    if (itemToDelete?.validado) {
      metaUpdates.totalValidados = increment(-1);
    }
    if (itemToDelete?.responsavel) {
      metaUpdates[`bipsPorOperador.${itemToDelete.responsavel}`] = increment(-1);
    }
    if (itemToDelete?.saida) {
      metaUpdates[`saidasCount.${itemToDelete.saida}`] = increment(-1);
    }
    if (itemToDelete?.motivo) {
      metaUpdates[`motivosCount.${itemToDelete.motivo}`] = increment(-1);
    }

    try {
      await updateDoc(listaDocRef, metaUpdates);
    } catch (_) {}

    return true;
  } catch (error) {
    console.error('Erro ao excluir item da lista no servidor:', error);
    return false;
  }
}

/**
 * Exclui múltiplos itens em lote diretamente no servidor.
 */
export async function deleteItemsBatchFromLista(
  listaId: string,
  itemIds: string[]
): Promise<boolean> {
  if (!itemIds || itemIds.length === 0) return true;
  try {
    const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const chunkSize = 400;

    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = itemIds.slice(i, i + chunkSize);
      chunk.forEach(id => {
        const itemRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', id);
        batch.delete(itemRef);
      });
      await batch.commit();
    }

    try {
      await updateDoc(listaDocRef, {
        totalItens: increment(-itemIds.length),
        updatedAt: serverTimestamp()
      });
    } catch (_) {}

    return true;
  } catch (error) {
    console.error('Erro ao excluir lote de itens:', error);
    return false;
  }
}

/**
 * Adiciona itens em lote na subcoleção do servidor (chunks seguros de 400).
 */
export async function addItemsBatchToLista(listaId: string, items: ColetaItem[]): Promise<boolean> {
  if (!items || items.length === 0) return true;
  try {
    const chunkSize = 400;
    for (let i = 0; i < items.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = items.slice(i, i + chunkSize);
      chunk.forEach((item, index) => {
        const itemId = item.id || `item-${Date.now()}-${i + index}`;
        const ref = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', itemId);
        const itemData = cleanUndefined({
          ...item,
          id: itemId,
          codigoClean: cleanDigits(item.codigo),
          timestamp: item.timestamp || (Date.now() - (i + index) * 10)
        });
        batch.set(ref, itemData, { merge: true });
      });
      await batch.commit();
    }

    const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    try {
      await updateDoc(listaDocRef, {
        totalItens: increment(items.length),
        updatedAt: serverTimestamp()
      });
    } catch (_) {}

    return true;
  } catch (error) {
    console.error('Erro ao adicionar itens em lote no servidor:', error);
    return false;
  }
}

/**
 * Atualiza motivo de múltiplos itens em lote.
 */
export async function updateItemsBatchMotivo(
  listaId: string,
  itemIds: string[],
  novoMotivo: string
): Promise<boolean> {
  if (!itemIds || itemIds.length === 0) return true;
  try {
    const chunkSize = 400;
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = itemIds.slice(i, i + chunkSize);
      chunk.forEach(id => {
        const ref = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', id);
        batch.update(ref, {
          motivo: novoMotivo,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Erro ao atualizar motivo em lote:', error);
    return false;
  }
}

/**
 * Paginação real no servidor com limite de 100 por página.
 * "Implemente paginação real no servidor com limite de 100 por página. Nunca carregue tudo para depois fatiá."
 */
export async function getItemsPage(
  listaId: string,
  pageSize: number = 100,
  cursorDoc: QueryDocumentSnapshot | null = null,
  direction: 'next' | 'prev' = 'next'
): Promise<{
  items: ColetaItem[];
  firstDoc: QueryDocumentSnapshot | null;
  lastDoc: QueryDocumentSnapshot | null;
  count: number;
}> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    let q;

    if (!cursorDoc) {
      q = query(colRef, orderBy('timestamp', 'desc'), limit(pageSize));
    } else if (direction === 'next') {
      q = query(colRef, orderBy('timestamp', 'desc'), startAfter(cursorDoc), limit(pageSize));
    } else {
      q = query(colRef, orderBy('timestamp', 'desc'), endBefore(cursorDoc), limit(pageSize));
    }

    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as ColetaItem));
    const firstDoc = snap.docs.length > 0 ? snap.docs[0] : null;
    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return {
      items,
      firstDoc,
      lastDoc,
      count: items.length
    };
  } catch (error) {
    console.error('Erro ao buscar página de itens no servidor:', error);
    return { items: [], firstDoc: null, lastDoc: null, count: 0 };
  }
}

/**
 * Pesquisa por ID diretamente no servidor, retornando correspondências mesmo fora da página atual.
 * "Faça pesquisa por ID diretamente no servidor, mesmo que o item esteja fora da página atual."
 */
export async function searchItemsInLista(
  listaId: string,
  queryText: string,
  maxResults: number = 100
): Promise<ColetaItem[]> {
  const trimmed = queryText.trim().toUpperCase();
  if (!trimmed) return [];

  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const resultsMap = new Map<string, ColetaItem>();

    // 1. Busca exata pelo campo codigo
    const qExact = query(colRef, where('codigo', '==', trimmed), limit(maxResults));
    const exactSnap = await getDocs(qExact);
    exactSnap.docs.forEach(d => resultsMap.set(d.id, { ...d.data(), id: d.id } as ColetaItem));

    // 2. Busca exata por ID do documento
    try {
      const docSnap = await getDoc(doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', queryText.trim()));
      if (docSnap.exists()) {
        resultsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id } as ColetaItem);
      }
    } catch (_) {}

    // 3. Busca por dígitos limpos
    const cleanNum = cleanDigits(trimmed);
    if (cleanNum && cleanNum !== trimmed && resultsMap.size < maxResults) {
      const qClean = query(colRef, where('codigoClean', '==', cleanNum), limit(maxResults));
      const cleanSnap = await getDocs(qClean);
      cleanSnap.docs.forEach(d => resultsMap.set(d.id, { ...d.data(), id: d.id } as ColetaItem));
    }

    // 4. Busca por prefixo no código
    if (resultsMap.size < maxResults) {
      const qPrefix = query(
        colRef,
        where('codigo', '>=', trimmed),
        where('codigo', '<=', trimmed + '\uf8ff'),
        limit(maxResults)
      );
      const prefixSnap = await getDocs(qPrefix);
      prefixSnap.docs.forEach(d => resultsMap.set(d.id, { ...d.data(), id: d.id } as ColetaItem));
    }

    return Array.from(resultsMap.values());
  } catch (error) {
    console.error('Erro na pesquisa de itens no servidor:', error);
    return [];
  }
}

/**
 * Pesquisa múltiplos IDs diretamente no servidor em todas as subcoleções de listas.
 * Utiliza collectionGroup('itens') para busca ultra-rápida sem transferir dados locais.
 */
export async function searchItemsAcrossAllListas(
  terms: string[]
): Promise<Map<string, { item: ColetaItem; listaId: string }>> {
  const results = new Map<string, { item: ColetaItem; listaId: string }>();
  if (!terms || terms.length === 0) return results;

  const uniqueTerms = Array.from(new Set(terms.map(t => t.trim().toUpperCase()).filter(Boolean)));
  if (uniqueTerms.length === 0) return results;

  try {
    const chunkSize = 30; // Limite do operador 'in' do Firestore
    for (let i = 0; i < uniqueTerms.length; i += chunkSize) {
      const chunk = uniqueTerms.slice(i, i + chunkSize);
      const cleanChunk = chunk.map(cleanDigits).filter(Boolean);

      // 1. Busca por codigo
      const qCodigo = query(
        collectionGroup(db, 'itens'),
        where('codigo', 'in', chunk)
      );
      const snapCodigo = await getDocs(qCodigo);
      snapCodigo.docs.forEach(d => {
        const item = { ...d.data(), id: d.id } as ColetaItem;
        const listaId = d.ref.parent.parent?.id || '';
        results.set(item.codigo.toUpperCase(), { item, listaId });
        if (item.codigoClean) {
          results.set(item.codigoClean, { item, listaId });
        }
      });

      // 2. Busca por codigoClean
      if (cleanChunk.length > 0) {
        const qClean = query(
          collectionGroup(db, 'itens'),
          where('codigoClean', 'in', cleanChunk)
        );
        const snapClean = await getDocs(qClean);
        snapClean.docs.forEach(d => {
          const item = { ...d.data(), id: d.id } as ColetaItem;
          const listaId = d.ref.parent.parent?.id || '';
          if (!results.has(item.codigo.toUpperCase())) {
            results.set(item.codigo.toUpperCase(), { item, listaId });
          }
          if (item.codigoClean && !results.has(item.codigoClean)) {
            results.set(item.codigoClean, { item, listaId });
          }
        });
      }
    }
  } catch (error) {
    console.error('Erro ao pesquisar itens em todas as listas no servidor:', error);
  }

  return results;
}

/**
 * Busca todos os itens de uma lista exclusivamente para fins de finalização ou exportação de CSV.
 */
export async function getAllItemsForExport(listaId: string): Promise<ColetaItem[]> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const q = query(colRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
  } catch (error) {
    console.error('Erro ao buscar todos os itens para exportação no servidor:', error);
    return [];
  }
}

/**
 * Busca itens de um grupo específico no servidor.
 */
export async function getItemsOfGrupo(listaId: string, grupoId: string): Promise<ColetaItem[]> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const q = query(colRef, where('grupoId', '==', grupoId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
  } catch (error) {
    console.error('Erro ao buscar itens do grupo no servidor:', error);
    return [];
  }
}

/**
 * Exclui a lista e todos os seus itens da subcoleção no servidor de forma ultra-rápida e otimizada (lotes iterativos).
 */
export async function deleteLista(listaId: string): Promise<boolean> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');

    // Deleta em lotes iterativos de 400 sem baixar todos os documentos de uma vez na RAM
    while (true) {
      const q = query(colRef, limit(400));
      const snap = await getDocs(q);
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      if (snap.docs.length < 400) break;
    }

    // 2. Exclui o documento pai
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Erro ao excluir lista de coleta no servidor:', error);
    return false;
  }
}

/**
 * Migra de forma segura uma única lista legado para subcoleção de forma idempotente.
 */
export async function migrateSingleLegacyLista(listaId: string, itens: ColetaItem[]): Promise<boolean> {
  try {
    if (!Array.isArray(itens) || itens.length === 0) return true;
    const chunkSize = 400;
    for (let i = 0; i < itens.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = itens.slice(i, i + chunkSize);
      chunk.forEach((item, index) => {
        const itemId = item.id || `item-${Date.now()}-${i + index}`;
        const itemRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', itemId);
        batch.set(itemRef, cleanUndefined({
          ...item,
          id: itemId,
          codigoClean: cleanDigits(item.codigo),
          timestamp: item.timestamp || (Date.now() - (i + index) * 10)
        }), { merge: true });
      });
      await batch.commit();
    }

    const totalItens = itens.length;
    const totalValidados = itens.filter(i => i.validado).length;
    const bipsPorOperador: Record<string, number> = {};
    const saidasCount: Record<string, number> = {};
    const motivosCount: Record<string, number> = {};

    itens.forEach(item => {
      const op = item.responsavel || 'Operador';
      bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
      if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
      if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
    });

    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await updateDoc(docRef, {
      itens: deleteField(),
      totalItens,
      totalValidados,
      bipsPorOperador,
      saidasCount,
      motivosCount,
      migrationVersion: 2,
      legacyMigratedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log(`[Migração Segura] Lista ${listaId} migrada com sucesso (${totalItens} itens).`);
    return true;
  } catch (err) {
    console.error(`Erro ao migrar lista antiga ${listaId}:`, err);
    return false;
  }
}

/**
 * Recalcula contadores da lista diretamente a partir da subcoleção de itens de forma determinística.
 */
export async function recalculateListaCounters(listaId: string): Promise<boolean> {
  if (!listaId) return false;
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const snap = await getDocs(colRef);
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));

    const totalItens = items.length;
    const totalValidados = items.filter(i => i.validado).length;
    const bipsPorOperador: Record<string, number> = {};
    const saidasCount: Record<string, number> = {};
    const motivosCount: Record<string, number> = {};

    items.forEach(item => {
      const op = item.responsavel || 'Operador';
      bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
      if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
      if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
    });

    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await setDoc(docRef, cleanUndefined({
      totalItens,
      totalValidados,
      bipsPorOperador,
      saidasCount,
      motivosCount,
      updatedAt: serverTimestamp()
    }), { merge: true });

    return true;
  } catch (err) {
    console.error('Erro ao recalcular contadores da lista:', err);
    return false;
  }
}
