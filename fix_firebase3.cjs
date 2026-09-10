const fs = require('fs');
let fileContent = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const regex = /export async function saveListaItemsBatch[\s\S]*?(?=\n\/\*\*|\nexport async function|\nasync function)/;

const newFunc = `export async function saveListaItemsBatch(
  listaId: string,
  items: ColetaItem[],
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<boolean> {
  if (!listaId || !items || items.length === 0) return true;

  const uniqueItemsMap = new Map<string, ColetaItem>();
  for (const item of items) {
    const cleanCod = item.codigo ? item.codigo.toString().trim().toUpperCase() : '';
    if (!cleanCod) continue;
    uniqueItemsMap.set(cleanCod, {
      ...item,
      codigo: cleanCod
    });
  }

  const deduplicatedItems = Array.from(uniqueItemsMap.values());
  const total = deduplicatedItems.length;

  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;

    const data = snap.data() as ColetaLista;
    const existingItens = data.itens || [];
    const itemsMap = new Map(existingItens.map(i => [i.codigo, i]));

    for (const item of deduplicatedItems) {
      itemsMap.set(item.codigo, item);
    }

    const updatedItens = Array.from(itemsMap.values());
    
    const cleanedData = cleanUndefined({
      itens: updatedItens,
      totalItens: updatedItens.length,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 10000));
    
    if (ramListasMap.has(listaId)) {
      const local = ramListasMap.get(listaId);
      ramListasMap.set(listaId, { ...local, ...data, itens: updatedItens } as ColetaLista);
    }

    if (onProgress) {
      onProgress(total, total, 100);
    }
    return true;
  } catch (error) {
    console.error('Error saving batch to main document:', error);
    return false;
  }
}
`;

fileContent = fileContent.replace(regex, newFunc);
fs.writeFileSync('src/lib/firebase.ts', fileContent);
