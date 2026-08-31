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

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;

const REFUGO_COLLECTION = 'refugo';
const MAIN_REFUGO_DOC_ID = 'current_refugo_csv';
const MAIN_REFUGO_SCANS_DOC_ID = 'current_refugo_scans';
const LOCAL_STORAGE_REFUGO_KEY = 'refugo_current_csv_data';
const LOCAL_STORAGE_REFUGO_SCANS_KEY = 'refugo_scanned_items';

const COLETOR_COLLECTION = 'coletor';
const MAIN_DOC_ID = 'current_csv';
const LOCAL_STORAGE_KEY = 'coletor_current_csv_data';

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
    console.warn('Erro ao escutar refugo em tempo real:', error);
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


export async function saveRefugoScans(scans: any[]): Promise<boolean> {
  try {
    localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(scans));
  } catch (err) {
    console.warn('Falha ao salvar scans localmente:', err);
  }
  
  try {
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await withTimeout(
      setDoc(refugoScansRef, {
        scans,
        updatedAt: serverTimestamp(),
      }),
      3500
    );
    return true;
  } catch (error) {
    console.warn('Aviso: Firestore offline (scans salvos localmente):', error);
    return true;
  }
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
    console.warn('Erro ao escutar scans em tempo real:', error);
  });

  return unsubscribe;
}
