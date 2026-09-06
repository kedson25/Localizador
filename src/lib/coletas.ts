import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  arrayUnion, 
  onSnapshot, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db, withTimeout } from './firebase';

export type SaidaOption = 'Saída PM' | 'Saída SD' | 'Saída AM' | 'Em rota';
export type MotivoOption = 'Bipado' | 'Transferência' | 'Roteirizado' | 'Aguardando coleta';

export interface ScannedItem {
  id: string;
  scannedAt: string;
  scannedBy?: string;
  scannedById?: string;
  saida?: SaidaOption;
  motivo?: MotivoOption;
}

export interface DirtyScanItem {
  id: string;
  reason: 'nao_pertence_lista' | 'ja_bipado' | 'invalido';
  reasonText: string;
  scannedAt: string;
  scannedBy?: string;
  scannedById?: string;
}

export interface ItemDetail {
  saida: SaidaOption;
  motivo: MotivoOption;
  scannedAt?: string;
  scannedBy?: string;
}

export interface ColetaList {
  id: string;
  name: string;
  date: string;
  cycle: string;
  ids: string[];
  isPrivate: boolean;
  pin?: string;
  scannedItems: ScannedItem[];
  dirtyItems?: DirtyScanItem[];
  itemDetails?: Record<string, ItemDetail>;
  status?: 'Em andamento' | 'Finalizada';
  createdAt: string;
  createdBy: {
    id: string;
    username: string;
  };
  teamMembers: string[]; // array of user IDs
  teamMemberUsernames?: string[]; // array of usernames for quick display
  isPublicToAll?: boolean;
}

const COLLECTION_NAME = 'coletas_listas';
const LOCAL_STORAGE_BACKUP_KEY = 'coletas_list_db_v2';

// Helper to update local backup
function updateLocalBackup(lists: ColetaList[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(lists));
  } catch (e) {
    console.warn('Erro ao salvar backup local de listas:', e);
  }
}

export const DEFAULT_DEMO_LIST: ColetaList = {
  id: 'lista_padrao_coleta_01',
  name: 'Aba de Coleta',
  date: '05/09/2026',
  cycle: 'PM',
  ids: [
    '782300123456789012',
    '782300987654321098',
    '782301234567890123',
    '782309876543210987',
    '782300111222333444',
    '782300555666777888',
    '782300999888777666',
    '782301112233445566',
    '782301998877665544',
    '782300102938475610',
    '782300564738291045',
    '782301667788990011',
    '782300223344556677',
    '782301998765432100',
    '782300345678901234',
    '782301234998877665',
    '782300778899001122',
    '782301445566778899',
    '782300667788990055',
    '782301889900112233',
  ],
  scannedItems: [
    { id: '782300123456789012', saida: 'Saída PM', motivo: 'Bipado', scannedAt: '2026-09-05T10:00:00Z', scannedBy: 'kedson' },
    { id: '782300987654321098', saida: 'Saída SD', motivo: 'Transferência', scannedAt: '2026-09-05T10:05:00Z', scannedBy: 'kedson' },
    { id: '782301234567890123', saida: 'Saída AM', motivo: 'Roteirizado', scannedAt: '2026-09-05T10:10:00Z', scannedBy: 'kedson' },
    { id: '782300111222333444', saida: 'Saída PM', motivo: 'Bipado', scannedAt: '2026-09-05T10:15:00Z', scannedBy: 'kedson' },
    { id: '782300555666777888', saida: 'Saída SD', motivo: 'Transferência', scannedAt: '2026-09-05T10:20:00Z', scannedBy: 'kedson' },
    { id: '782300999888777666', saida: 'Saída AM', motivo: 'Roteirizado', scannedAt: '2026-09-05T10:25:00Z', scannedBy: 'kedson' },
    { id: '782301998877665544', saida: 'Saída PM', motivo: 'Bipado', scannedAt: '2026-09-05T10:30:00Z', scannedBy: 'kedson' },
    { id: '782300102938475610', saida: 'Saída SD', motivo: 'Transferência', scannedAt: '2026-09-05T10:35:00Z', scannedBy: 'kedson' },
    { id: '782300564738291045', saida: 'Saída AM', motivo: 'Roteirizado', scannedAt: '2026-09-05T10:40:00Z', scannedBy: 'kedson' },
    { id: '782300223344556677', saida: 'Saída PM', motivo: 'Bipado', scannedAt: '2026-09-05T10:45:00Z', scannedBy: 'kedson' },
    { id: '782301998765432100', saida: 'Saída SD', motivo: 'Transferência', scannedAt: '2026-09-05T10:50:00Z', scannedBy: 'kedson' },
    { id: '782300345678901234', saida: 'Saída AM', motivo: 'Roteirizado', scannedAt: '2026-09-05T10:55:00Z', scannedBy: 'kedson' },
  ],
  itemDetails: {
    '782300123456789012': { saida: 'Saída PM', motivo: 'Bipado' },
    '782300987654321098': { saida: 'Saída SD', motivo: 'Transferência' },
    '782301234567890123': { saida: 'Saída AM', motivo: 'Roteirizado' },
    '782309876543210987': { saida: 'Em rota', motivo: 'Aguardando coleta' },
    '782300111222333444': { saida: 'Saída PM', motivo: 'Bipado' },
    '782300555666777888': { saida: 'Saída SD', motivo: 'Transferência' },
    '782300999888777666': { saida: 'Saída AM', motivo: 'Roteirizado' },
    '782301112233445566': { saida: 'Em rota', motivo: 'Aguardando coleta' },
    '782301998877665544': { saida: 'Saída PM', motivo: 'Bipado' },
    '782300102938475610': { saida: 'Saída SD', motivo: 'Transferência' },
    '782300564738291045': { saida: 'Saída AM', motivo: 'Roteirizado' },
    '782301667788990011': { saida: 'Em rota', motivo: 'Aguardando coleta' },
    '782300223344556677': { saida: 'Saída PM', motivo: 'Bipado' },
    '782301998765432100': { saida: 'Saída SD', motivo: 'Transferência' },
    '782300345678901234': { saida: 'Saída AM', motivo: 'Roteirizado' },
    '782301234998877665': { saida: 'Em rota', motivo: 'Aguardando coleta' },
    '782300778899001122': { saida: 'Saída PM', motivo: 'Bipado' },
    '782301445566778899': { saida: 'Saída SD', motivo: 'Transferência' },
    '782300667788990055': { saida: 'Saída AM', motivo: 'Roteirizado' },
    '782301889900112233': { saida: 'Em rota', motivo: 'Aguardando coleta' },
  },
  status: 'Em andamento',
  isPrivate: false,
  createdAt: '2026-09-05T08:00:00Z',
  createdBy: { id: 'admin', username: 'kedson' },
  teamMembers: ['admin'],
  teamMemberUsernames: ['kedson'],
  isPublicToAll: true,
};

export function getLocalColetasBackup(): ColetaList[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    
    // Also check older legacy key
    const legacy = localStorage.getItem('coletas_list_db');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          ...item,
          createdBy: item.createdBy || { id: 'legacy', username: 'Administrador' },
          teamMembers: item.teamMembers || [],
          teamMemberUsernames: item.teamMemberUsernames || [],
          isPublicToAll: item.isPublicToAll ?? true,
        }));
      }
    }
  } catch (e) {
    console.warn('Erro ao ler backup local de listas:', e);
  }
  return [DEFAULT_DEMO_LIST];
}

/**
 * Realtime listener for all collection lists in Firestore
 */
export function subscribeToColetaLists(callback: (lists: ColetaList[]) => void): () => void {
  // Call immediately with local cache for instant zero-latency loading
  const localLists = getLocalColetasBackup();
  if (localLists.length > 0) {
    callback(localLists);
  }

  const colRef = collection(db, COLLECTION_NAME);
  
  const unsubscribe = onSnapshot(colRef, (snapshot) => {
    const lists: ColetaList[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as ColetaList;
      lists.push({
        ...data,
        id: docSnap.id
      });
    });

    // Sort by createdAt descending
    lists.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    
    updateLocalBackup(lists);
    callback(lists);
  }, (error) => {
    console.warn('Firestore offline ou lento, operando com listas locais:', error);
    callback(getLocalColetasBackup());
  });

  return unsubscribe;
}

/**
 * Save / Create a new list or update an existing list
 */
export async function saveColetaList(list: ColetaList): Promise<boolean> {
  // Update local backup immediately
  const current = getLocalColetasBackup();
  const existingIdx = current.findIndex(l => l.id === list.id);
  let updatedList: ColetaList[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = list;
  } else {
    updatedList = [list, ...current];
  }
  updateLocalBackup(updatedList);

  try {
    const listRef = doc(db, COLLECTION_NAME, list.id);
    await withTimeout(
      setDoc(listRef, {
        ...list,
        updatedAt: serverTimestamp()
      }, { merge: true }),
      2500
    );
    return true;
  } catch (error) {
    console.warn('Firestore offline ao salvar lista (salva localmente):', error);
    return true;
  }
}

/**
 * Delete a list
 */
export async function deleteColetaList(listId: string): Promise<boolean> {
  // Remove from local backup immediately
  const current = getLocalColetasBackup().filter(l => l.id !== listId);
  updateLocalBackup(current);

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(deleteDoc(listRef), 2500);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao deletar lista (deletada localmente):', error);
    return true;
  }
}

/**
 * Real-time atomic scan item addition
 */
export async function addScannedItemToList(
  listId: string, 
  item: ScannedItem
): Promise<boolean> {
  // Update local backup first!
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (target) {
    if (!target.ids.includes(item.id)) {
      target.ids = [...target.ids, item.id];
    }
    target.scannedItems = [...(target.scannedItems || []), item];
    if (!target.itemDetails) target.itemDetails = {};
    target.itemDetails[item.id] = {
      saida: item.saida || 'Saída PM',
      motivo: item.motivo || 'Bipado',
      scannedAt: item.scannedAt,
      scannedBy: item.scannedBy
    };
    updateLocalBackup(current);
  }

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      updateDoc(listRef, {
        ids: arrayUnion(item.id),
        scannedItems: arrayUnion(item),
        [`itemDetails.${item.id}`]: {
          saida: item.saida || 'Saída PM',
          motivo: item.motivo || 'Bipado',
          scannedAt: item.scannedAt,
          scannedBy: item.scannedBy || 'Coletor'
        },
        updatedAt: serverTimestamp()
      }),
      2500
    );
    return true;
  } catch (error) {
    console.warn('Firestore offline ao registrar bip (salvo localmente):', error);
    return true;
  }
}

/**
 * Update Team Members for a list
 */
export async function updateListTeam(
  listId: string, 
  teamMembers: string[], 
  teamMemberUsernames: string[],
  isPublicToAll: boolean
): Promise<boolean> {
  // Update local backup first
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (target) {
    target.teamMembers = teamMembers;
    target.teamMemberUsernames = teamMemberUsernames;
    target.isPublicToAll = isPublicToAll;
    updateLocalBackup(current);
  }

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      updateDoc(listRef, {
        teamMembers,
        teamMemberUsernames,
        isPublicToAll,
        updatedAt: serverTimestamp()
      }),
      2500
    );
    return true;
  } catch (error) {
    console.warn('Firestore offline ao atualizar equipe (atualizado localmente):', error);
    return true;
  }
}

/**
 * Register a dirty/rejected scan with lock information in Firestore
 */
export async function addDirtyScanToList(
  listId: string, 
  item: DirtyScanItem
): Promise<boolean> {
  // Update local backup
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (target) {
    target.dirtyItems = [...(target.dirtyItems || []), item];
    updateLocalBackup(current);
  }

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      updateDoc(listRef, {
        dirtyItems: arrayUnion(item),
        updatedAt: serverTimestamp()
      }),
      2500
    );
    return true;
  } catch (error) {
    console.warn('Firestore offline ao registrar ID sujo (salvo localmente):', error);
    return true;
  }
}

/**
 * Update a package's saída and motivo in the list
 */
export async function updatePackageDetail(
  listId: string,
  itemId: string,
  saida: SaidaOption,
  motivo: MotivoOption
): Promise<boolean> {
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (target) {
    if (!target.itemDetails) target.itemDetails = {};
    target.itemDetails[itemId] = {
      saida,
      motivo,
      scannedAt: new Date().toISOString()
    };
    
    // Also update in scannedItems if exists
    const sIdx = target.scannedItems?.findIndex(s => s.id === itemId);
    if (sIdx !== undefined && sIdx >= 0) {
      target.scannedItems[sIdx] = {
        ...target.scannedItems[sIdx],
        saida,
        motivo
      };
    }
    updateLocalBackup(current);
  }

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      updateDoc(listRef, {
        [`itemDetails.${itemId}`]: {
          saida,
          motivo,
          updatedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      }),
      2500
    );
    return true;
  } catch (err) {
    console.warn('Firestore offline ao atualizar detalhe do pacote (atualizado localmente):', err);
    return true;
  }
}

/**
 * Update list status (Em andamento / Finalizada)
 */
export async function updateListStatus(
  listId: string,
  status: 'Em andamento' | 'Finalizada'
): Promise<boolean> {
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (target) {
    target.status = status;
    updateLocalBackup(current);
  }

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      updateDoc(listRef, {
        status,
        updatedAt: serverTimestamp()
      }),
      2500
    );
    return true;
  } catch (err) {
    console.warn('Firestore offline ao atualizar status da lista:', err);
    return true;
  }
}

/**
 * Toggle package collected state or mark as collected
 */
export async function togglePackageCollected(
  listId: string,
  itemId: string,
  collectorUsername: string = 'Coletor',
  collectorUserId: string = 'user',
  chosenSaida: SaidaOption = 'Saída PM',
  chosenMotivo: MotivoOption = 'Bipado'
): Promise<boolean> {
  const current = getLocalColetasBackup();
  const target = current.find(l => l.id === listId);
  if (!target) return false;

  const isAlready = target.scannedItems.some(s => s.id === itemId);
  if (!target.itemDetails) target.itemDetails = {};

  if (isAlready) {
    // Unmark as collected -> revert to Em rota & Aguardando coleta
    target.scannedItems = target.scannedItems.filter(s => s.id !== itemId);
    target.itemDetails[itemId] = {
      saida: 'Em rota',
      motivo: 'Aguardando coleta'
    };
  } else {
    // Mark as collected
    target.scannedItems = [
      ...target.scannedItems,
      {
        id: itemId,
        scannedAt: new Date().toISOString(),
        scannedBy: collectorUsername,
        scannedById: collectorUserId,
        saida: chosenSaida,
        motivo: chosenMotivo
      }
    ];
    target.itemDetails[itemId] = {
      saida: chosenSaida,
      motivo: chosenMotivo,
      scannedAt: new Date().toISOString(),
      scannedBy: collectorUsername
    };
  }
  updateLocalBackup(current);

  try {
    const listRef = doc(db, COLLECTION_NAME, listId);
    await withTimeout(
      setDoc(listRef, target, { merge: true }),
      2500
    );
    return true;
  } catch (err) {
    console.warn('Firestore offline ao alternar coleta de pacote:', err);
    return true;
  }
}
