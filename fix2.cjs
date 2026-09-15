const fs = require('fs');

let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(/export async function loadRefugoScans[\s\S]*?export async function clearRefugoScans/, `
export async function loadRefugoScans(): Promise<any[] | null> {
  let localData: any[] | null = null;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_REFUGO_SCANS_KEY);
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch (err) {}
  
  try {
    const q = query(collection(db, 'refugo_scans_items'), orderBy('timestamp', 'desc'), limit(500));
    const snap = await withTimeout(getDocs(q), 3000);
    const remoteData = snap.docs.map(d => d.data());
    try {
      localStorage.setItem(LOCAL_STORAGE_REFUGO_SCANS_KEY, JSON.stringify(remoteData));
    } catch (_) {}
    return remoteData;
  } catch (error) {
    console.warn('Não foi possível conectar ao Firestore para scans:', error);
  }
  return localData;
}

export async function clearRefugoScans`);

fs.writeFileSync('src/lib/firebase.ts', code);
