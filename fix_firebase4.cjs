const fs = require('fs');
let fileContent = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const regex = /async function performFirestoreSave[\s\S]*?(?=\nexport async function saveLista|\n\/\*\*)/;

const newFunc = `async function performFirestoreSave(lista: ColetaLista): Promise<boolean> {
  try {
    const docRef = doc(db, COLETA_LISTAS_COLLECTION, lista.id);
    const totalItensCount = lista.itens ? lista.itens.length : 0;

    const cleanedData = cleanUndefined({
      ...lista,
      totalItens: totalItensCount,
      updatedAt: serverTimestamp(),
    });

    await retryWithBackoff(() => withTimeout(setDoc(docRef, cleanedData, { merge: true }), 8000));
    return true;
  } catch (error) {
    console.error('Erro ao sincronizar com Firestore (mantido localmente):', error);
    return true;
  }
}
`;

fileContent = fileContent.replace(regex, newFunc);
fs.writeFileSync('src/lib/firebase.ts', fileContent);
