const fs = require('fs');

let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const scansLogic = `
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

    return true;
  } catch (error) {
    console.error('Erro ao limpar scans de refugo:', error);
    throw error;
  }
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
`;

// Remove the old saveRefugoScans, loadRefugoScans, clearRefugoScans, listenToRefugoScans
code = code.replace(/let refugoScansDebounceTimer: any = null;[\s\S]*?export async function saveRefugoScans[\s\S]*?export async function loadRefugoScans[\s\S]*?export async function clearRefugoScans[\s\S]*?export function listenToRefugoScans[\s\S]*?return unsubscribe;\s*\}/, scansLogic.trim());

fs.writeFileSync('src/lib/firebase.ts', code);
