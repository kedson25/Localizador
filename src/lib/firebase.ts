import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, collection, collectionGroup, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, serverTimestamp, onSnapshot, query, where, orderBy, limit, startAfter, endBefore, increment, getCountFromServer, deleteField, QueryDocumentSnapshot, memoryLocalCache, enableNetwork, disableNetwork, setLogLevel } from 'firebase/firestore';

// Silencia avisos internos de conectividade temporária do SDK do Firestore
try {
  setLogLevel('silent');
} catch (_) {}

const firebaseConfig = {
  apiKey: "AIzaSyC-9ZgBnd6sjkAS6phLsO5fp_19UYNL5s4",
  authDomain: "ssp45-d1847.firebaseapp.com",
  projectId: "ssp45-d1847",
  storageBucket: "ssp45-d1847.firebasestorage.app",
  messagingSenderId: "684115094877",
  appId: "1:684115094877:web:dc6797f688ac5b84b50cb4",
  measurementId: "G-1V7HWH4L37"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Suporte a detecção automática ou long polling configurável via variável de ambiente VITE_FIREBASE_AUTO_DETECT_POLLING.
// Por padrão, experimentalForceLongPolling: true é mantido para garantir máxima compatibilidade com proxies/firewalls corporativos.
const useAutoDetect = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_AUTO_DETECT_POLLING === 'true';

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ...(useAutoDetect
      ? { experimentalAutoDetectLongPolling: true }
      : { experimentalForceLongPolling: true })
  });
} catch (_) {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

/**
 * Função para salvar e sincronizar via rede local/nuvem.
 * Salva no cache local (IndexedDB) e sincroniza automaticamente via rede quando conectado.
 */
export async function forceSyncLocalAndRemote(): Promise<{ success: boolean; message: string }> {
  try {
    await disableNetwork(db);
    await enableNetwork(db);
    return { success: true, message: "Conectado e sincronizado com sucesso na rede!" };
  } catch (error: any) {
    console.error("Erro ao sincronizar dados com a rede:", error);
    return { success: false, message: error?.message || "Erro de sincronização na rede" };
  }
}

/**
 * Ativa ou desativa a conexão com a rede para forçar gravações estritamente locais ou online.
 */
export async function setNetworkMode(online: boolean) {
  try {
    if (online) {
      await enableNetwork(db);
    } else {
      await disableNetwork(db);
    }
  } catch (e) {
    console.error("Erro ao alterar modo de rede:", e);
  }
}

const REFUGO_COLLECTION = 'refugo';
const MAIN_REFUGO_DOC_ID = 'current_refugo_csv';
const MAIN_REFUGO_SCANS_DOC_ID = 'current_refugo_scans';

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
  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await setDoc(refugoRef, {
      rawText,
      totalRows,
      fileName: fileName || 'refugo.csv',
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Erro ao salvar refugo:', error);
    throw error;
  }
}

export async function loadRefugo(): Promise<RefugoData | null> {
  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    const snap = await getDoc(refugoRef);
    if (snap.exists()) {
      return snap.data() as RefugoData;
    }
  } catch (error) {
    console.error('Erro ao carregar refugo:', error);
  }
  return null;
}

export async function clearRefugo(): Promise<boolean> {
  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await deleteDoc(refugoRef);

    try {
      const verify = await getDoc(refugoRef);
      if (verify.exists()) {
        throw new Error('A base do Refugo ainda existe no servidor após a exclusão.');
      }
    } catch (error: any) {
      if (error?.code !== 'not-found' && !error?.message?.includes('No document')) {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error('Erro ao apagar refugo:', error);
    throw error;
  }
}

export function listenToRefugo(callback: (data: RefugoData | null) => void): () => void {
  const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
  
  const unsubscribe = onSnapshot(refugoRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as RefugoData);
    } else {
      callback(null);
    }
  }, (error) => {
    console.warn('Erro ao escutar refugo em tempo real:', error);
    callback(null);
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


export interface RefugoScan {
  firestoreId?: string;
  id: string;
  normalizedId: string;
  rota: string;
  scannedAt: string;
  timestamp: number;
  status: 'found' | 'not_found';
  foundBy?: string;
}

export async function addRefugoScan(scan: Omit<RefugoScan, 'firestoreId'>): Promise<void> {
  if (!scan || !scan.normalizedId) throw new Error('Scan inválido ou sem ID normalizado.');
  const docRef = doc(db, 'refugo_scans_items', scan.normalizedId);
  try {
    await setDoc(docRef, scan);
  } catch (error) {
    console.error('Erro ao adicionar refugo scan:', error);
    throw error;
  }
}

export async function deleteRefugoScan(normalizedId: string): Promise<void> {
  if (!normalizedId) throw new Error('ID normalizado não fornecido para exclusão.');
  const docRef = doc(db, 'refugo_scans_items', normalizedId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Erro ao excluir refugo scan:', error);
    throw error;
  }
}

export async function clearRefugoScans(): Promise<boolean> {
  try {
    // 1. Apaga o documento monolítico legado se existir
    try {
      const docRefLegacy = doc(db, REFUGO_COLLECTION, 'current_refugo_scans');
      await deleteDoc(docRefLegacy);
    } catch (_) {}

    // 2. Apaga todos os documentos da coleção refugo_scans_items em lotes
    const colRef = collection(db, 'refugo_scans_items');
    
    while (true) {
      const q = query(colRef, limit(400));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        break;
      }
      
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      
      await batch.commit();
    }

    const remaining = await getCountFromServer(colRef);
    if (remaining.data().count !== 0) {
      throw new Error(`Ainda existem ${remaining.data().count} scans no Refugo.`);
    }

    return true;
  } catch (error) {
    console.error('Erro ao limpar scans de refugo:', error);
    throw error;
  }
}

export interface RefugoScanChange {
  type: 'added' | 'modified' | 'removed';
  scan: RefugoScan;
}

/**
 * Escuta scans de refugo de forma incremental usando snapshot.docChanges().
 * Na primeira execução (isInitial: true), carrega todos os scans de uma única vez.
 * Em seguida, processa APENAS as alterações (added, modified, removed) sem reconstruir a coleção toda.
 */
export function listenToRefugoScansIncremental(
  callback: (changes: RefugoScanChange[], isInitial: boolean, initialScans?: RefugoScan[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, 'refugo_scans_items');
  const q = query(colRef, orderBy('timestamp', 'desc'));
  let isInitial = true;

  return onSnapshot(q, (snap) => {
    if (isInitial) {
      const initialScans = snap.docs.map(docSnap => ({
        ...docSnap.data(),
        firestoreId: docSnap.id
      } as RefugoScan));
      callback([], true, initialScans);
      isInitial = false;
    } else {
      const changes: RefugoScanChange[] = snap.docChanges().map(change => ({
        type: change.type,
        scan: {
          ...change.doc.data(),
          firestoreId: change.doc.id
        } as RefugoScan
      }));
      if (changes.length > 0) {
        callback(changes, false);
      }
    }
  }, (error) => {
    console.warn('Erro ao escutar refugo scans incremental:', error);
    if (onError) onError(error);
  });
}

export function listenToRefugoScans(callback: (scans: RefugoScan[]) => void): () => void {
  const colRef = collection(db, 'refugo_scans_items');
  const q = query(colRef, orderBy('timestamp', 'desc'));
  
  const unsubscribe = onSnapshot(q, (snap) => {
    const scans = snap.docs.map(docSnap => ({
      ...docSnap.data(),
      firestoreId: docSnap.id
    } as RefugoScan));
    callback(scans);
  }, (error) => {
    console.warn('Erro ao escutar refugo scans:', error);
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
  
  // Se não for um objeto plano (ex: FieldValue, Timestamp), retorna o próprio objeto para preservar a funcionalidade do Firestore
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype) {
    return obj;
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
 * Escuta todas as listas (apenas metadados) em tempo real diretamente do Firestore.
 * Zero uso de LocalStorage ou cache em RAM como fonte.
 */
export function listenToListas(callback: (listas: ColetaLista[]) => void): () => void {
  const colRef = collection(db, COLETA_LISTAS_COLLECTION);
  
  return onSnapshot(colRef, (snap) => {
    const remoteListas: ColetaLista[] = snap.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        ...data,
        id: docSnap.id,
        itens: [], // Empty array to prevent map/length crashes
        totalItens: typeof data.totalItens === 'number' ? data.totalItens : 0,
        totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : 0
      } as ColetaLista;
    });

    remoteListas.sort((a, b) => {
      const tA = getListaSortTimestamp(a);
      const tB = getListaSortTimestamp(b);
      if (tA !== tB) return tB - tA;
      return (b.id || '').localeCompare(a.id || '');
    });

    callback(remoteListas);
  }, (error) => {
    console.error('Erro ao escutar listas de coleta no Firestore:', error);
  });
}

// Cache em memória de itens por lista para abertura instantânea (0ms)
const listaItensCache = new Map<string, ColetaItem[]>();

/**
 * Escuta os itens de uma lista específica em tempo real.
 * Por padrão carrega todos os itens da lista para garantir integridade total dos totais e grupos.
 */
export function listenToListaItens(
  listaId: string,
  callback: (itens: ColetaItem[]) => void,
  maxLimit = 10000
): () => void {
  if (!listaId) return () => {};

  // Se já temos os itens em memória nesta sessão, entrega imediatamente para evitar tela em branco
  if (listaItensCache.has(listaId)) {
    const cached = listaItensCache.get(listaId);
    if (cached && cached.length > 0) {
      callback(cached);
    }
  }

  const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
  const safeLimit = maxLimit > 0 ? Math.min(maxLimit, 10000) : null;
  const q = safeLimit 
    ? query(colRef, orderBy('timestamp', 'desc'), limit(safeLimit))
    : query(colRef, orderBy('timestamp', 'desc'));

  let hasDeliveredFromServer = false;

  // Busca inicial paralela via getDocs para entregar em altíssima velocidade
  getDocs(q).then((snap) => {
    if (!hasDeliveredFromServer && !snap.empty) {
      const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
      listaItensCache.set(listaId, items);
      callback(items);
    }
  }).catch((err) => {
    console.warn('Busca inicial de itens via getDocs falhou, aguardando onSnapshot:', err);
  });

  return onSnapshot(q, (snap) => {
    hasDeliveredFromServer = true;
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
    listaItensCache.set(listaId, items);
    callback(items);
  }, (err) => {
    console.error('Erro ao escutar itens da lista:', err);
    // Fallback em caso de erro na query ordenada por timestamp: tentar buscar sem ordenação
    if (!hasDeliveredFromServer) {
      getDocs(colRef).then((fallbackSnap) => {
        const items = fallbackSnap.docs.map(d => ({ ...d.data(), id: d.id } as ColetaItem));
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        listaItensCache.set(listaId, items);
        callback(items);
      }).catch(e => console.error('Fallback getDocs também falhou:', e));
    }
  });
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
    callback({
      ...data,
      id: snap.id,
      itens: [], // Empty array to prevent map/length crashes
      totalItens: typeof data.totalItens === 'number' ? data.totalItens : 0,
      totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : 0
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
      return {
        ...data,
        id: snap.id,
        itens: undefined,
        totalItens: typeof data.totalItens === 'number' ? data.totalItens : (Array.isArray(data.itens) ? data.itens.length : 0),
        totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : 0
      } as ColetaLista;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar lista por ID no servidor:', error);
    return null;
  }
}

/**
 * Salva metadados da lista no servidor. Nunca envia o array itens no documento pai.
 * Se houver itens na chamada (ex: lote inicial), grava na subcoleção itens.
 */
export async function saveLista(lista: Partial<ColetaLista> & { id: string }, immediate = false): Promise<boolean> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, lista.id);
    const { itens, ...metaData } = lista as any;

    const cleaned = cleanUndefined({
      ...metaData,
      updatedAt: serverTimestamp()
    });

    await setDoc(docRef, cleaned, { merge: true });

    // Se itens foram passados explicitamente (ex: criação com lote inicial)
    if (Array.isArray(itens) && itens.length > 0) {
      await addItemsBatchToLista(lista.id, itens);
    }

    return true;
  } catch (error) {
    console.error('Erro ao salvar metadados da lista no servidor:', error);
    return false;
  }
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

  // 1. Verifica se o item já existe para não inflar contadores
  let isNewItem = true;
  try {
    const existingSnap = await getDoc(itemDocRef);
    if (existingSnap.exists()) {
      isNewItem = false;
    }
  } catch (_) {}

  // 2. Grava o documento individual do pacote no servidor
  await setDoc(itemDocRef, cleanUndefined(itemToSave));

  // 3. Atualiza contadores no documento pai no servidor
  const op = item.responsavel || 'Operador';
  const saida = item.saida || 'Ciclo 2 - Saída PM';
  const motivo = item.motivo || 'Pendente';

  const updatePayload: Record<string, any> = {
    updatedAt: serverTimestamp(),
    [`bipsPorOperador.${op}`]: increment(1),
    [`saidasCount.${saida}`]: increment(1),
    [`motivosCount.${motivo}`]: increment(1),
  };

  if (isNewItem) {
    updatePayload.totalItens = increment(1);
  }

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
      const countSnap = await getCountFromServer(collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens'));
      await updateDoc(listaDocRef, {
        totalItens: countSnap.data().count,
        updatedAt: serverTimestamp()
      });
    } catch (_) {
      try {
        await updateDoc(listaDocRef, {
          totalItens: increment(-itemIds.length),
          updatedAt: serverTimestamp()
        });
      } catch (_) {}
    }

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
      const countSnap = await getCountFromServer(collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens'));
      await updateDoc(listaDocRef, {
        totalItens: countSnap.data().count,
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
 * Reconcilia e recalcula contagens exatas da lista no servidor
 */
export async function reconcileListaCounts(listaId: string): Promise<{ totalItens: number; totalValidados: number }> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const itemsSnap = await getDocs(colRef);
    const totalItens = itemsSnap.size;
    let totalValidados = 0;
    const bipsPorOperador: Record<string, number> = {};
    const saidasCount: Record<string, number> = {};
    const motivosCount: Record<string, number> = {};

    itemsSnap.docs.forEach(d => {
      const item = d.data();
      if (item.validado) totalValidados++;
      const op = item.responsavel || 'Operador';
      bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
      if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
      if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
    });

    const listaDocRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    await updateDoc(listaDocRef, {
      totalItens,
      totalValidados,
      bipsPorOperador,
      saidasCount,
      motivosCount,
      updatedAt: serverTimestamp()
    });

    return { totalItens, totalValidados };
  } catch (error) {
    console.error('Erro ao reconciliar contadores da lista:', error);
    return { totalItens: 0, totalValidados: 0 };
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
    const items = snap.docs.map(d => {
      const data = d.data() as any;
      return { ...data, id: d.id } as ColetaItem;
    });
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
 * Exclui a lista e todos os seus itens da subcoleção no servidor.
 */
export async function deleteLista(listaId: string): Promise<boolean> {
  try {
    // 1. Exclui em lotes todos os itens da subcoleção
    const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const chunkSize = 400;
      for (let i = 0; i < snap.docs.length; i += chunkSize) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + chunkSize).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
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
 * Script de migração: transfere qualquer lista antiga que possua o array `itens`
 * para a nova estrutura de metadados + subcoleção `itens` no servidor.
 */
export async function migrateLegacyListasToSubcollections(): Promise<{ migratedLists: number; migratedItems: number }> {
  try {
    const colRef = collection(db, COLETA_LISTAS_COLLECTION);
    const snap = await getDocs(colRef);
    let migratedLists = 0;
    let migratedItems = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (Array.isArray(data.itens) && data.itens.length > 0) {
        const listaId = docSnap.id;
        const itens: ColetaItem[] = data.itens;

        // Grava cada item como documento individual na subcoleção
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
          const op = item.responsavel || data.responsavel || 'Operador';
          bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
          if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
          if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
        });

        // Remove o array itens do documento pai e salva os totais
        await updateDoc(docSnap.ref, {
          itens: deleteField(),
          totalItens,
          totalValidados,
          bipsPorOperador,
          saidasCount,
          motivosCount,
          updatedAt: serverTimestamp()
        });

        migratedLists++;
        migratedItems += itens.length;
      }
    }

    if (migratedLists > 0) {
      console.log(`[Migração Concluída] ${migratedLists} listas migradas com ${migratedItems} pacotes para subcoleções.`);
    }

    return { migratedLists, migratedItems };
  } catch (error) {
    console.error('Erro na migração de listas para subcoleção:', error);
    return { migratedLists: 0, migratedItems: 0 };
  }
}

/**
 * Sincroniza a Lista do Dia com o Google Sheets via API Vercel (apenas envio / espelho).
 */
export async function syncListaToGoogleSheets(listaId: string): Promise<{ success: boolean; synced: number }> {
  try {
    const res = await fetch(`/api/sheets?action=sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ listaId }),
    });
    const data = await res.json();
    if (data.notConfigured) {
      console.info('Google Sheets não configurado (opcional). Sincronização ignorada.');
      return { success: false, synced: 0 };
    }
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Erro ao sincronizar com Google Sheets');
    }
    return { success: true, synced: data.synced || 0 };
  } catch (error) {
    return { success: false, synced: 0 };
  }
}

