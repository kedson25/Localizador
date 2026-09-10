import type { ColetaItem, ColetaLista } from '../types';

// A snapshot keeps its original values through object spreads. This lets a stale
// editor change one field without overwriting another operator's newer scans.
const baseline = Symbol('listaBaseline');
type Snapshot = ColetaLista & { [baseline]?: ColetaLista };
export interface ListaMutation {
  sequence?: number;
  id: string;
  listaId: string;
  metadata: Partial<ColetaLista>;
  upserts: ColetaItem[];
  removedIds: string[];
  deleted?: boolean;
  create?: boolean;
}

const metadataKeys = ['nome', 'tipo', 'grupos', 'grupoAtivoId', 'rota', 'data',
  'responsavel', 'status', 'saidaPadrao', 'motivoPadrao', 'porcentagemAcerto',
  'fechamentoGaiola', 'itensFaltaram'] as const;

export function snapshotLista(lista: ColetaLista): ColetaLista {
  return { ...lista, [baseline]: lista } as Snapshot;
}

export function plainLista(lista: ColetaLista): ColetaLista {
  const { [baseline]: _, ...plain } = lista as Snapshot;
  return plain;
}

function persistedItem(item: ColetaItem): ColetaItem {
  const fields = ['id', 'codigo', 'rota', 'saida', 'motivo', 'scannedAt', 'responsavel', 'grupoId', 'validado'] as const;
  return Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key, item[key]])) as unknown as ColetaItem;
}

export function diffLista(lista: ColetaLista): ListaMutation {
  const original = (lista as Snapshot)[baseline];
  const previous = new Map((original?.itens || []).map(item => [item.id, item]));
  const nextIds = new Set(lista.itens.map(item => item.id));
  const metadata: Record<string, unknown> = {};
  for (const key of metadataKeys) {
    if ((!original && lista[key] !== undefined) || (original && JSON.stringify(lista[key]) !== JSON.stringify(original[key]))) {
      metadata[key] = lista[key] ?? null;
    }
  }
  return {
    id: crypto.randomUUID(), listaId: lista.id, metadata,
    create: !original,
    upserts: lista.itens.flatMap(item => {
      const next = persistedItem(item);
      const old = previous.get(item.id);
      if (!old) return [next];
      const before = persistedItem(old);
      const patch: Record<string, unknown> = { id: item.id };
      for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
        if (JSON.stringify(next[key]) !== JSON.stringify(before[key])) patch[key] = next[key] ?? null;
      }
      return Object.keys(patch).length > 1 ? [patch as unknown as ColetaItem] : [];
    }),
    removedIds: [...previous.keys()].filter(id => !nextIds.has(id)),
  };
}

export function applyListaMutation(lista: ColetaLista | undefined, mutation: ListaMutation): ColetaLista | undefined {
  if (mutation.deleted) return undefined;
  const items = new Map((lista?.itens || []).map(item => [item.id, item]));
  for (const id of mutation.removedIds) items.delete(id);
  const added = new Map<string, ColetaItem>();
  for (const item of mutation.upserts) {
    const pending = { ...items.get(item.id), ...item, syncStatus: 'pendente' as const };
    if (!items.has(item.id)) added.set(item.id, pending);
    else items.set(item.id, pending);
  }
  return { ...lista, ...mutation.metadata, id: mutation.listaId, itens: [...added.values(), ...items.values()] } as ColetaLista;
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ColetaListasDurableDB', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('listas', { keyPath: 'id' });
        request.result.createObjectStore('mutations', { keyPath: 'sequence', autoIncrement: true });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Falha ao gravar no armazenamento local.'));
  });
}

export async function readListaStorage(): Promise<{ listas: ColetaLista[]; mutations: ListaMutation[] }> {
  const db = await openDatabase();
  const tx = db.transaction(['listas', 'mutations'], 'readonly');
  const finished = complete(tx);
  const listas = tx.objectStore('listas').getAll();
  const mutations = tx.objectStore('mutations').getAll();
  await finished;
  return { listas: listas.result, mutations: mutations.result };
}

// Store the confirmed base plus its journal. Optimistic changes from a later,
// uncommitted mutation must never leak into the durable cache.
export async function persistListaMutation(mutation: ListaMutation, lista?: ColetaLista): Promise<number> {
  const db = await openDatabase();
  const tx = db.transaction(['listas', 'mutations'], 'readwrite');
  const finished = complete(tx);
  if (lista) tx.objectStore('listas').put(plainLista(lista));
  else tx.objectStore('listas').delete(mutation.listaId);
  const request = tx.objectStore('mutations').add(mutation);
  await finished;
  return request.result as number;
}

export async function cacheLista(listaId: string, lista?: ColetaLista): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('listas', 'readwrite');
  const finished = complete(tx);
  if (lista) tx.objectStore('listas').put(plainLista(lista));
  else tx.objectStore('listas').delete(listaId);
  await finished;
}

export async function acknowledgeListaMutation(sequence: number, listaId: string, lista?: ColetaLista): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['listas', 'mutations'], 'readwrite');
  const finished = complete(tx);
  tx.objectStore('mutations').delete(sequence);
  if (lista) tx.objectStore('listas').put(plainLista(lista));
  else tx.objectStore('listas').delete(listaId);
  await finished;
}
