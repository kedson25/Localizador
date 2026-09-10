const fs = require('fs');
let fileContent = fs.readFileSync('src/lib/firebase.ts', 'utf8');

// 1. Remove the > 500 limit in saveLista and always save the whole list
// We need to replace the performFirestoreSave logic
const oldPerformFirestoreSave = `
    if (lista.itens && lista.itens.length > 500) {
      // 1. Salvar itens no subcolection
      await saveListaItemsBatch(lista.id, lista.itens);

      // 2. Salvar documento principal sem inflar payload
      const { itens, ...metadata } = lista;
      const mainData = cleanUndefined({
        ...metadata,
        totalItens: totalItensCount,
        itens: lista.itens.slice(0, 100), // Preview limitado para cache leve
        updatedAt: serverTimestamp(),
      });

      await retryWithBackoff(() => withTimeout(setDoc(docRef, mainData, { merge: true }), 5000));
      return true;
    }

    const cleanedData = cleanUndefined({
      ...lista,
      totalItens: totalItensCount,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 5000));
    return true;
`;

const newPerformFirestoreSave = `
    const cleanedData = cleanUndefined({
      ...lista,
      totalItens: totalItensCount,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 5000));
    return true;
`;

fileContent = fileContent.replace(oldPerformFirestoreSave.trim(), newPerformFirestoreSave.trim());

// 2. Also fix ControleRefugo "Brancas" export issue if any, by checking saveRefugo
const oldSaveRefugo = `
  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    await retryWithBackoff(() =>
      withTimeout(
        setDoc(refugoRef, {
          rawText,
          totalRows,
          fileName: fileName || 'refugo.csv',
          updatedAt: serverTimestamp(),
        }),
        5000
      )
    );
    return true;
  } catch (error) {
`;

const newSaveRefugo = `
  try {
    const refugoRef = doc(db, REFUGO_COLLECTION, MAIN_REFUGO_DOC_ID);
    
    // To prevent 1MB limit crash, we only save the first 1000000 characters if it's too large,
    // OR we just don't save rawText in firebase if it's too big, just the metadata.
    // Actually, let's compress or truncate it if needed. For now, let's truncate to 900KB.
    let textToSave = rawText;
    if (textToSave.length > 900000) {
      textToSave = textToSave.substring(0, 900000);
      console.warn('CSV was truncated for Firestore to avoid 1MB limit');
    }

    await retryWithBackoff(() =>
      withTimeout(
        setDoc(refugoRef, {
          rawText: textToSave,
          totalRows,
          fileName: fileName || 'refugo.csv',
          updatedAt: serverTimestamp(),
        }),
        10000
      )
    );
    return true;
  } catch (error) {
`;

fileContent = fileContent.replace(oldSaveRefugo.trim(), newSaveRefugo.trim());

fs.writeFileSync('src/lib/firebase.ts', fileContent);
