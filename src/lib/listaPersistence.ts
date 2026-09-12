import type { ColetaItem, ColetaLista } from '../types';


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
  expectedRevision?: number;
  expectedItems?: Record<string, number>;
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
  const { syncStatus: _, revision, firebase_uid, user_name, user_email, created_at, ...data } = item;
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as unknown as ColetaItem;
}

export function diffLista(lista: ColetaLista): ListaMutation {
  const original = (lista as Snapshot)[baseline];
  const previous = new Map((original?.itens || []).map(item => [item.id, item]));
  const nextIds = new Set(lista.itens.map(item => item.id));
  const metadata: Record<string, unknown> = {};
  for (const key of metadataKeys) {
    if (lista[key] !== undefined && (!original || JSON.stringify(lista[key]) !== JSON.stringify(original[key]))) {
      metadata[key] = lista[key];
    }
  }
  const upserts = lista.itens.filter(item => !previous.has(item.id) ||
    JSON.stringify(persistedItem(item)) !== JSON.stringify(persistedItem(previous.get(item.id)!)))
    .map(persistedItem);
  const removedIds = [...previous.keys()].filter(id => !nextIds.has(id));
  // Send concurrency versions only for rows touched by this mutation. A scan in
  // a 1,600-item list therefore remains one small request.
  const expectedIds = new Set([...upserts.map(item => item.id), ...removedIds]);
  return {
    id: crypto.randomUUID(), listaId: lista.id, metadata,
    create: !original,
    expectedRevision: original?.revision,
    expectedItems: Object.fromEntries([...expectedIds].flatMap(id => {
      const item = previous.get(id);
      return item ? [[id, item.revision ?? 0]] : [];
    })),
    upserts,
    removedIds,
  };
}

export function applyListaMutation(lista: ColetaLista | undefined, mutation: ListaMutation): ColetaLista | undefined {
  if (mutation.deleted) return undefined;
  const items = new Map((lista?.itens || []).map(item => [item.id, item]));
  for (const id of mutation.removedIds) items.delete(id);
  const added: ColetaItem[] = [];
  for (const item of mutation.upserts) {
    const pending = { ...items.get(item.id), ...item, syncStatus: 'pendente' as const };
    if (!items.has(item.id)) added.push(pending);
    else items.set(item.id, pending);
  }
  return { ...lista, ...mutation.metadata, id: mutation.listaId, itens: [...added, ...items.values()] } as ColetaLista;
}

