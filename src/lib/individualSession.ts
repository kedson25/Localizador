import type { ColetaItem } from '../types';

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ColetaIndividualDrafts', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('items', { keyPath: ['session', 'id'] }).createIndex('session', 'session');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche a outra aba para liberar o rascunho individual.'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Falha ao guardar o rascunho individual.'));
  });
}

export async function loadIndividualSession(session: string): Promise<ColetaItem[]> {
  const db = await openDatabase();
  const transaction = db.transaction('items', 'readonly');
  const done = complete(transaction);
  const request = transaction.objectStore('items').index('session').getAll(session);
  await done;
  return request.result.sort((a, b) => b.order - a.order).map(({ item }) => item);
}

// Every scan writes one small record, independent of the size of the draft.
export async function saveIndividualItems(session: string, items: ColetaItem[], removedIds: string[] = []): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('items', 'readwrite');
  const done = complete(transaction);
  const store = transaction.objectStore('items');
  for (const id of removedIds) store.delete([session, id]);
  const now = Date.now();
  items.forEach((item, index) => store.put({ session, id: item.id, item, order: now - index / Math.max(1, items.length) }));
  await done;
}

export async function clearIndividualSession(session: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('items', 'readwrite');
  const done = complete(transaction);
  const cursor = transaction.objectStore('items').index('session').openCursor(session);
  cursor.onsuccess = () => {
    if (!cursor.result) return;
    cursor.result.delete();
    cursor.result.continue();
  };
  await done;
}
