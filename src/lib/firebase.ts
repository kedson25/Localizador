import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
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
export const db = getFirestore(app);

const COLETOR_COLLECTION = 'coletor';
const MAIN_DOC_ID = 'current_csv';

export interface ColetorData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

/**
 * Save CSV raw text and metadata to Firebase Firestore collection 'coletor'
 */
export async function saveToColetor(rawText: string, totalRows: number, fileName?: string): Promise<boolean> {
  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await setDoc(coletorRef, {
      rawText,
      totalRows,
      fileName: fileName || 'relatorio.csv',
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao salvar no Firestore (coleção coletor):', error);
    return false;
  }
}

/**
 * Load saved CSV data from Firebase Firestore collection 'coletor'
 */
export async function loadFromColetor(): Promise<ColetorData | null> {
  try {
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    const snap = await getDoc(coletorRef);
    if (snap.exists()) {
      return snap.data() as ColetorData;
    }
    return null;
  } catch (error) {
    console.error('Erro ao carregar do Firestore (coleção coletor):', error);
    return null;
  }
}

/**
 * Clear/Delete CSV data from Firebase Firestore collection 'coletor'
 */
export async function clearColetor(): Promise<boolean> {
  try {
    // Delete main document
    const coletorRef = doc(db, COLETOR_COLLECTION, MAIN_DOC_ID);
    await deleteDoc(coletorRef);

    // If there are other documents in 'coletor', delete them in batch
    const querySnap = await getDocs(collection(db, COLETOR_COLLECTION));
    if (!querySnap.empty) {
      const batch = writeBatch(db);
      querySnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error('Erro ao apagar da coleção coletor no Firestore:', error);
    return false;
  }
}
