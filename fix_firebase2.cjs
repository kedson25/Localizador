const fs = require('fs');
let fileContent = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const oldBatch = `
  // 2. Process in sequential native Firestore Batches of 300 items (between 200 and 400)
  const BATCH_SIZE = 300;
  let processedCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = deduplicatedItems.slice(i, i + BATCH_SIZE);

    await retryWithBackoff(async () => {
      const batch = writeBatch(db);
      const colRef = collection(db, COLETA_LISTAS_COLLECTION, listaId, 'itens');

      for (const item of chunk) {
        const docId = item.codigo; // determinístico para idempotência
        const itemRef = doc(db, COLETA_LISTAS_COLLECTION, listaId, 'itens', docId);
        batch.set(itemRef, cleanUndefined(item), { merge: true });
      }

      await withTimeout(batch.commit(), 10000);
    });

    processedCount += chunk.length;
    if (onProgress) {
      onProgress(processedCount, total, Math.round((processedCount / total) * 100));
    }
  }

  return true;
`;

const newBatch = `
  // Instead of writing to a subcollection which is not being read, we will merge the items 
  // into the main document's 'itens' array to ensure real-time synchronization works.
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, listaId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;

    const data = snap.data() as ColetaLista;
    const existingItens = data.itens || [];
    const itemsMap = new Map(existingItens.map(i => [i.codigo, i]));

    // Update with new items
    for (const item of deduplicatedItems) {
      itemsMap.set(item.codigo, item);
    }

    const updatedItens = Array.from(itemsMap.values());
    const totalItensCount = updatedItens.length;

    const cleanedData = cleanUndefined({
      itens: updatedItens,
      totalItens: totalItensCount,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 10000));
    
    // Update local cache
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
`;

fileContent = fileContent.replace(oldBatch.trim(), newBatch.trim());
fs.writeFileSync('src/lib/firebase.ts', fileContent);
