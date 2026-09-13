/**
 * Script de migração para o modelo Servidor-Primeiro (Server-First).
 * Transfere todas as listas legadas que continham arrays 'itens' no documento pai
 * para a nova estrutura de metadados + subcoleção `coleta_listas/{listaId}/itens/{itemId}`.
 *
 * Execução:
 * npx tsx scripts/migrate.ts
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  updateDoc,
  deleteField,
  serverTimestamp
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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function cleanDigits(val: string | undefined | null): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  const cleaned: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) cleaned[k] = cleanUndefined(obj[k]);
  }
  return cleaned;
}

async function runMigration() {
  console.log('--- INICIANDO MIGRAÇÃO SERVER-FIRST: LOCALIZADOR ---');
  console.log('Conectando ao Firestore...');

  const colRef = collection(db, 'coleta_listas');
  const snap = await getDocs(colRef);
  console.log(`Encontradas ${snap.docs.length} listas no Firestore.`);

  let migratedCount = 0;
  let totalItemsCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const listaId = docSnap.id;

    if (Array.isArray(data.itens) && data.itens.length > 0) {
      const itens = data.itens;
      console.log(`Migrando lista "${data.nome || listaId}" (${itens.length} itens)...`);

      const chunkSize = 400;
      for (let i = 0; i < itens.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = itens.slice(i, i + chunkSize);
        chunk.forEach((item: any, idx: number) => {
          const itemId = item.id || `item-${Date.now()}-${i + idx}`;
          const itemDocRef = doc(db, 'coleta_listas', listaId, 'itens', itemId);
          const cleanItem = cleanUndefined({
            ...item,
            id: itemId,
            codigoClean: cleanDigits(item.codigo),
            timestamp: item.timestamp || (Date.now() - (i + idx) * 10)
          });
          batch.set(itemDocRef, cleanItem, { merge: true });
        });
        await batch.commit();
      }

      const totalItens = itens.length;
      const totalValidados = itens.filter((i: any) => i.validado).length;
      const bipsPorOperador: Record<string, number> = {};
      const saidasCount: Record<string, number> = {};
      const motivosCount: Record<string, number> = {};

      itens.forEach((item: any) => {
        const op = item.responsavel || data.responsavel || 'Operador';
        bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
        if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
        if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
      });

      // Remove array itens do documento pai e armazena metadados
      await updateDoc(docSnap.ref, {
        itens: deleteField(),
        totalItens,
        totalValidados,
        bipsPorOperador,
        saidasCount,
        motivosCount,
        updatedAt: serverTimestamp()
      });

      migratedCount++;
      totalItemsCount += itens.length;
      console.log(`Lista "${data.nome || listaId}" migrada com sucesso!`);
    } else {
      console.log(`Lista "${data.nome || listaId}" já está na estrutura de metadados.`);
    }
  }

  console.log('--- MIGRAÇÃO CONCLUÍDA ---');
  console.log(`Listas migradas: ${migratedCount}`);
  console.log(`Itens transferidos para subcoleções: ${totalItemsCount}`);
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
