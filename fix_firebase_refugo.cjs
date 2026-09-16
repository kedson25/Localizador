const fs = require('fs');

let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

// Replace LOCAL_STORAGE_REFUGO_KEY usages and Refugo logic

const refugoLogic = `
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
`;

code = code.replace(/export interface RefugoData \{[\s\S]*?export function listenToRefugo[\s\S]*?return unsubscribe;\s*\}/, refugoLogic.trim());

fs.writeFileSync('src/lib/firebase.ts', code);
