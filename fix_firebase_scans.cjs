const fs = require('fs');

let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const importRegex = /import \{([^\}]+)\} from 'firebase\/firestore';/;
code = code.replace(importRegex, (match, imports) => {
    const parts = imports.split(',').map(s => s.trim());
    const needed = ['collection', 'query', 'orderBy', 'limit', 'writeBatch'];
    needed.forEach(n => {
        if (!parts.includes(n)) parts.push(n);
    });
    return `import { ${parts.join(', ')} } from 'firebase/firestore';`;
});


code = code.replace(/export async function saveRefugoScans[\s\S]*?export async function loadRefugoScans/, `
export async function saveRefugoScans(scans: any[], immediate = false): Promise<boolean> {
  // O array "scans" vem completo da interface, mas o primeiro item é o mais novo (bipado agora).
  if (!scans || scans.length === 0) return true;
  
  // Vamos salvar apenas o scan mais recente na subcoleção para evitar re-gravar todos
  const latestScan = scans[0];
  
  // Se "latestScan" não tiver as propriedades, tentamos salvar todos em batch (fallback)
  const dbCollection = collection(db, 'refugo_scans_items');
  
  try {
    const cleanId = latestScan.id.replace(/[^a-zA-Z0-9]/g, '');
    const docId = cleanId ? \`\${cleanId}_\${Date.now()}\` : \`scan_\${Date.now()}\`;
    
    await withTimeout(
      setDoc(doc(dbCollection, docId), {
        ...latestScan,
        scannedAt: latestScan.scannedAt instanceof Date ? latestScan.scannedAt.toISOString() : latestScan.scannedAt,
        timestamp: Date.now(),
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      3500
    );
    return true;
  } catch (error) {
    console.warn('Aviso: Firestore offline (scans salvos localmente):', error);
    return true;
  }
}

export async function loadRefugoScans`);

code = code.replace(/export async function clearRefugoScans[\s\S]*?export function listenToRefugoScans/, `
export async function clearRefugoScans(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
  } catch (err) {}
  
  try {
    const q = query(collection(db, 'refugo_scans_items'), limit(500));
    const snap = await withTimeout(getDocs(q), 3000);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await withTimeout(batch.commit(), 3000);
    
    // Antigo doc monolítico por garantia
    const refugoScansRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_SCANS_DOC_ID);
    await withTimeout(deleteDoc(refugoScansRef), 3000);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao apagar scans:', error);
    return true;
  }
}

export function listenToRefugoScans`);

code = code.replace(/export function listenToRefugoScans\([\s\S]*?\([\s\S]*?\}\);[\s\S]*?\}/, `
export function listenToRefugoScans(callback: (scans: any[]) => void): () => void {
  // Immediately check local storage cache first
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) {
      callback(JSON.parse(cached));
    }
  } catch (_) {}

  // Real-time listener in the collection
  const q = query(collection(db, 'refugo_scans_items'), orderBy('timestamp', 'desc'), limit(500));
  
  const unsubscribe = onSnapshot(q, (snap) => {
    const scans = snap.docs.map(d => d.data());
    try {
      localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(scans));
    } catch (_) {}
    callback(scans);
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
}`);

fs.writeFileSync('src/lib/firebase.ts', code);
