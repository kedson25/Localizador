import { supabase, getSupabaseAccessToken } from './supabase';
import { ColetaLista, ColetaItem } from '../types';

const LOCAL_STORAGE_KEY = 'coletor_current_csv_data';
const COLETOR_STATE_ID = 'current';
const REFUGO_STATE_ID = 'current';

export const db = supabase;

export interface RefugoData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

export interface ColetorData {
  rawText: string;
  totalRows: number;
  updatedAt?: any;
  fileName?: string;
}

export interface RefugoScan {
  firestoreId?: string;
  id: string;
  normalizedId: string;
  rota: string;
  scannedAt: string;
  timestamp: number;
  status: 'found' | 'not_found';
  foundBy?: string;
}

export interface RefugoScanChange {
  type: 'added' | 'modified' | 'removed';
  scan: RefugoScan;
}

function cleanDigits(val: string | undefined | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function normalizeCodigo(codigo: string | undefined | null): string {
  return String(codigo || '')
    .trim()
    .toUpperCase()
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, ' ');
}

function deterministicItemId(codigo: string): string {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) {
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  let hashA = 2166136261;
  let hashB = 5381;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    hashA ^= c;
    hashA = Math.imul(hashA, 16777619);
    hashB = Math.imul(hashB, 33) ^ c;
  }

  const h1 = (hashA >>> 0).toString(16).padStart(8, '0');
  const h2 = (hashB >>> 0).toString(16).padStart(8, '0');
  const prefix = normalized.replace(/[^A-Z0-9_-]/g, '_').slice(0, 48);
  return `${prefix}_${h1}${h2}`;
}

function mapLista(row: any): ColetaLista {
  return {
    id: String(row.id),
    nome: String(row.nome || ''),
    tipo: row.tipo || 'comum',
    grupos: Array.isArray(row.grupos) ? row.grupos : [],
    grupoAtivoId: row.grupo_ativo_id || undefined,
    rota: String(row.rota || ''),
    data: String(row.data || ''),
    saida: row.saida || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    responsavel: String(row.responsavel || ''),
    status: row.status === 'finalizada' ? 'finalizada' : 'em_andamento',
    saidaPadrao: String(row.saida_padrao || 'Ciclo 2 - Saída PM'),
    motivoPadrao: String(row.motivo_padrao || 'Pendente'),
    totalItens: Number(row.total_itens || 0),
    totalValidados: Number(row.total_validados || 0),
    saidasCount: row.saidas_count || {},
    motivosCount: row.motivos_count || {},
    rotasCount: row.rotas_count || {},
    bipsPorOperador: row.bips_por_operador || {},
    porcentagemAcerto:
      row.porcentagem_acerto === null || row.porcentagem_acerto === undefined
        ? undefined
        : Number(row.porcentagem_acerto),
    fechamentoGaiola: row.fechamento_gaiola || undefined,
    itensFaltaram:
      row.itens_faltaram === null || row.itens_faltaram === undefined
        ? undefined
        : Number(row.itens_faltaram),
    itens: [],
  };
}

function listaToRow(lista: Partial<ColetaLista> & { id: string }): Record<string, any> {
  const row: Record<string, any> = {
    id: lista.id,
    updated_at: new Date().toISOString(),
  };

  const mapping: Array<[keyof ColetaLista, string]> = [
    ['nome', 'nome'],
    ['tipo', 'tipo'],
    ['grupos', 'grupos'],
    ['grupoAtivoId', 'grupo_ativo_id'],
    ['rota', 'rota'],
    ['data', 'data'],
    ['saida', 'saida'],
    ['responsavel', 'responsavel'],
    ['status', 'status'],
    ['saidaPadrao', 'saida_padrao'],
    ['motivoPadrao', 'motivo_padrao'],
    ['totalItens', 'total_itens'],
    ['totalValidados', 'total_validados'],
    ['saidasCount', 'saidas_count'],
    ['motivosCount', 'motivos_count'],
    ['rotasCount', 'rotas_count'],
    ['bipsPorOperador', 'bips_por_operador'],
    ['porcentagemAcerto', 'porcentagem_acerto'],
    ['fechamentoGaiola', 'fechamento_gaiola'],
    ['itensFaltaram', 'itens_faltaram'],
  ];

  for (const [source, target] of mapping) {
    const value = lista[source];
    if (value !== undefined) row[target] = value;
  }

  if (lista.createdAt !== undefined) {
    row.created_at =
      typeof lista.createdAt === 'string'
        ? lista.createdAt
        : new Date(lista.createdAt).toISOString();
  }

  return row;
}

function mapItem(row: any): ColetaItem {
  return {
    id: String(row.id),
    codigo: String(row.codigo || ''),
    codigoClean: String(row.codigo_clean || ''),
    rota: String(row.rota || 'Sem Rota'),
    saida: String(row.saida || 'Ciclo 2 - Saída PM'),
    motivo: String(row.motivo || 'Pendente'),
    scannedAt: String(row.scanned_at || ''),
    responsavel: row.responsavel || undefined,
    grupoId: row.grupo_id || undefined,
    validado: Boolean(row.validado),
    timestamp: Number(row.timestamp || 0),
  };
}

function itemToRow(
  listaId: string,
  item: Partial<ColetaItem> & { codigo?: string },
  forcedId?: string
): Record<string, any> {
  const codigo = normalizeCodigo(item.codigo || '');
  const id = forcedId || item.id || deterministicItemId(codigo);

  return {
    lista_id: listaId,
    id,
    codigo,
    codigo_clean: item.codigoClean || cleanDigits(codigo),
    rota: item.rota || 'Sem Rota',
    saida: item.saida || 'Ciclo 2 - Saída PM',
    motivo: item.motivo || 'Pendente',
    scanned_at: item.scannedAt || new Date().toLocaleString('pt-BR'),
    responsavel: item.responsavel || 'Operador',
    grupo_id: item.grupoId || null,
    validado: item.validado === true,
    timestamp: item.timestamp || Date.now(),
    updated_at: new Date().toISOString(),
  };
}

function mapRefugoScan(row: any): RefugoScan {
  return {
    firestoreId: String(row.normalized_id || row.id || ''),
    id: String(row.id || ''),
    normalizedId: String(row.normalized_id || ''),
    rota: String(row.rota || ''),
    scannedAt: String(row.scanned_at || ''),
    timestamp: Number(row.timestamp || 0),
    status: row.status === 'not_found' ? 'not_found' : 'found',
    foundBy: row.found_by || undefined,
  };
}

function refugoScanToRow(scan: Omit<RefugoScan, 'firestoreId'>): Record<string, any> {
  return {
    normalized_id: scan.normalizedId,
    id: scan.id,
    rota: scan.rota || '',
    scanned_at: scan.scannedAt || new Date().toLocaleString('pt-BR'),
    timestamp: scan.timestamp || Date.now(),
    status: scan.status || 'found',
    found_by: scan.foundBy || null,
    updated_at: new Date().toISOString(),
  };
}

function uniqueChannelName(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function throwIfError(error: any, context: string) {
  if (error) {
    console.error(context, error);
    throw error;
  }
}

export async function forceSyncLocalAndRemote(): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('coleta_listas')
      .select('id', { head: true, count: 'exact' });
    throwIfError(error, 'Erro de conexão com Supabase');
    return { success: true, message: 'Conectado e sincronizado com Supabase.' };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erro de sincronização com Supabase.',
    };
  }
}

export async function setNetworkMode(_online: boolean) {
  return;
}

export function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);

  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) cleaned[key] = cleanUndefined(obj[key]);
  }
  return cleaned;
}

export async function saveRefugo(
  rawText: string,
  totalRows: number,
  fileName?: string
): Promise<boolean> {
  const { error } = await supabase.from('refugo_state').upsert(
    {
      id: REFUGO_STATE_ID,
      raw_text: rawText,
      total_rows: totalRows,
      file_name: fileName || 'refugo.csv',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  throwIfError(error, 'Erro ao salvar refugo no Supabase');
  return true;
}

export async function loadRefugo(): Promise<RefugoData | null> {
  const { data, error } = await supabase
    .from('refugo_state')
    .select('raw_text, total_rows, file_name, updated_at')
    .eq('id', REFUGO_STATE_ID)
    .maybeSingle();

  if (error) {
    console.warn('Erro ao carregar refugo do Supabase:', error);
    return null;
  }
  if (!data) return null;

  return {
    rawText: data.raw_text || '',
    totalRows: Number(data.total_rows || 0),
    fileName: data.file_name || undefined,
    updatedAt: data.updated_at,
  };
}

export async function clearRefugo(): Promise<boolean> {
  const { error } = await supabase
    .from('refugo_state')
    .delete()
    .eq('id', REFUGO_STATE_ID);
  throwIfError(error, 'Erro ao limpar refugo no Supabase');
  return true;
}

export function listenToRefugo(callback: (data: RefugoData | null) => void): () => void {
  let active = true;

  loadRefugo().then((data) => {
    if (active) callback(data);
  });

  const channel = supabase
    .channel(uniqueChannelName('refugo-state'))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'refugo_state',
        filter: `id=eq.${REFUGO_STATE_ID}`,
      },
      (payload: any) => {
        if (!active) return;
        if (payload.eventType === 'DELETE') {
          callback(null);
          return;
        }

        const row = payload.new;
        callback({
          rawText: row.raw_text || '',
          totalRows: Number(row.total_rows || 0),
          fileName: row.file_name || undefined,
          updatedAt: row.updated_at,
        });
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function saveToColetor(
  rawText: string,
  totalRows: number,
  fileName?: string
): Promise<boolean> {
  const localData: ColetorData = {
    rawText,
    totalRows,
    fileName: fileName || 'relatorio.csv',
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localData));
  } catch (_) {}

  const { error } = await supabase.from('coletor_state').upsert(
    {
      id: COLETOR_STATE_ID,
      raw_text: rawText,
      total_rows: totalRows,
      file_name: fileName || 'relatorio.csv',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('Supabase indisponível; coletor preservado no cache local:', error);
  }

  return true;
}

export async function loadFromColetor(): Promise<ColetorData | null> {
  let localData: ColetorData | null = null;

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (_) {}

  const { data, error } = await supabase
    .from('coletor_state')
    .select('raw_text, total_rows, file_name, updated_at')
    .eq('id', COLETOR_STATE_ID)
    .maybeSingle();

  if (error || !data) return localData;

  const remote: ColetorData = {
    rawText: data.raw_text || '',
    totalRows: Number(data.total_rows || 0),
    fileName: data.file_name || undefined,
    updatedAt: data.updated_at,
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remote));
  } catch (_) {}

  return remote;
}

export async function clearColetor(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (_) {}

  const { error } = await supabase
    .from('coletor_state')
    .delete()
    .eq('id', COLETOR_STATE_ID);

  if (error) {
    console.warn('Falha ao limpar coletor remoto; cache local já foi removido:', error);
  }
  return true;
}

export async function addRefugoScan(
  scan: Omit<RefugoScan, 'firestoreId'>
): Promise<void> {
  if (!scan?.normalizedId) {
    throw new Error('Scan inválido ou sem ID normalizado.');
  }

  const { error } = await supabase
    .from('refugo_scans')
    .upsert(refugoScanToRow(scan), { onConflict: 'normalized_id' });

  throwIfError(error, 'Erro ao adicionar scan de refugo no Supabase');
}

export async function deleteRefugoScan(normalizedId: string): Promise<void> {
  if (!normalizedId) {
    throw new Error('ID normalizado não fornecido para exclusão.');
  }

  const { error } = await supabase
    .from('refugo_scans')
    .delete()
    .eq('normalized_id', normalizedId);

  throwIfError(error, 'Erro ao excluir scan de refugo no Supabase');
}

export async function clearRefugoScans(): Promise<boolean> {
  const { error } = await supabase
    .from('refugo_scans')
    .delete()
    .neq('normalized_id', '__never__');

  throwIfError(error, 'Erro ao limpar scans de refugo no Supabase');
  return true;
}

async function loadRefugoScansInternal(): Promise<RefugoScan[]> {
  const { data, error } = await supabase
    .from('refugo_scans')
    .select('*')
    .order('timestamp', { ascending: false });

  throwIfError(error, 'Erro ao carregar scans de refugo do Supabase');
  return (data || []).map(mapRefugoScan);
}

export function listenToRefugoScansIncremental(
  callback: (
    changes: RefugoScanChange[],
    isInitial: boolean,
    initialScans?: RefugoScan[]
  ) => void,
  onError?: (error: any) => void
): () => void {
  let active = true;

  loadRefugoScansInternal()
    .then((scans) => {
      if (active) callback([], true, scans);
    })
    .catch((error) => onError?.(error));

  const channel = supabase
    .channel(uniqueChannelName('refugo-scans-incremental'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'refugo_scans' },
      (payload: any) => {
        if (!active) return;

        const raw = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!raw) return;

        const type: RefugoScanChange['type'] =
          payload.eventType === 'INSERT'
            ? 'added'
            : payload.eventType === 'DELETE'
              ? 'removed'
              : 'modified';

        callback([{ type, scan: mapRefugoScan(raw) }], false);
      }
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' && error) onError?.(error);
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function listenToRefugoScans(
  callback: (scans: RefugoScan[]) => void
): () => void {
  const state = new Map<string, RefugoScan>();
  let active = true;

  const emit = () => {
    const scans = Array.from(state.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    callback(scans);
  };

  loadRefugoScansInternal()
    .then((scans) => {
      if (!active) return;
      state.clear();
      scans.forEach((scan) => state.set(scan.normalizedId, scan));
      emit();
    })
    .catch((error) => console.warn('Erro ao carregar scans:', error));

  const channel = supabase
    .channel(uniqueChannelName('refugo-scans'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'refugo_scans' },
      (payload: any) => {
        if (!active) return;
        const raw = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!raw) return;
        const scan = mapRefugoScan(raw);

        if (payload.eventType === 'DELETE') {
          state.delete(scan.normalizedId);
        } else {
          state.set(scan.normalizedId, scan);
        }
        emit();
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function getListaSortTimestamp(lista: ColetaLista): number {
  if (!lista) return 0;

  for (const value of [lista.createdAt, (lista as any).updatedAt]) {
    if (!value) continue;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  if (lista.id) {
    const match = lista.id.match(/\d{12,}/);
    if (match) {
      const parsed = Number(match[0]);
      if (parsed > 1000000000000) return parsed;
    }
  }

  if (lista.data) {
    if (lista.data.includes('/')) {
      const [day, month, year] = lista.data.split('/').map(Number);
      const parsed = new Date(year, month - 1, day).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }
    const parsed = new Date(lista.data).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
}

async function loadListas(): Promise<ColetaLista[]> {
  const { data, error } = await supabase
    .from('coleta_listas')
    .select('*')
    .order('created_at', { ascending: false });

  throwIfError(error, 'Erro ao carregar listas do Supabase');

  const listas = (data || []).map(mapLista);
  listas.sort((a, b) => {
    const diff = getListaSortTimestamp(b) - getListaSortTimestamp(a);
    return diff !== 0 ? diff : (b.id || '').localeCompare(a.id || '');
  });
  return listas;
}

export function listenToListas(
  callback: (listas: ColetaLista[]) => void
): () => void {
  const state = new Map<string, ColetaLista>();
  let active = true;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      if (!active) return;
      const listas = Array.from(state.values()).sort((a, b) => {
        const diff = getListaSortTimestamp(b) - getListaSortTimestamp(a);
        return diff !== 0 ? diff : (b.id || '').localeCompare(a.id || '');
      });
      callback(listas);
    }, 20);
  };

  loadListas()
    .then((list) => {
      if (!active) return;
      state.clear();
      list.forEach((lista) => state.set(lista.id, lista));
      callback(list);
    })
    .catch((error) => console.error('Erro ao carregar listas:', error));

  const channel = supabase
    .channel(uniqueChannelName('coleta-listas'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coleta_listas' },
      (payload: any) => {
        if (!active) return;
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row?.id) return;

        if (payload.eventType === 'DELETE') state.delete(String(row.id));
        else state.set(String(row.id), mapLista(row));
        emit();
      }
    )
    .subscribe();

  return () => {
    active = false;
    if (emitTimer) clearTimeout(emitTimer);
    void supabase.removeChannel(channel);
  };
}

async function loadListaItens(
  listaId: string,
  maxLimit = 10000
): Promise<ColetaItem[]> {
  let request = supabase
    .from('coleta_itens')
    .select('*')
    .eq('lista_id', listaId)
    .order('timestamp', { ascending: false });

  if (maxLimit > 0) request = request.limit(Math.min(maxLimit, 10000));

  const { data, error } = await request;
  throwIfError(error, 'Erro ao carregar itens da lista no Supabase');
  return (data || []).map(mapItem);
}

const listaItensCache = new Map<string, ColetaItem[]>();

export function listenToListaItens(
  listaId: string,
  callback: (itens: ColetaItem[]) => void,
  maxLimit = 10000
): () => void {
  if (!listaId) return () => {};

  const state = new Map<string, ColetaItem>();
  let active = true;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;

  const cached = listaItensCache.get(listaId);
  if (cached?.length) {
    cached.forEach((item) => state.set(item.id, item));
    callback(cached);
  }

  const emit = () => {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      if (!active) return;
      const items = Array.from(state.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, maxLimit > 0 ? maxLimit : undefined);
      listaItensCache.set(listaId, items);
      callback(items);
    }, 35);
  };

  loadListaItens(listaId, maxLimit)
    .then((items) => {
      if (!active) return;
      state.clear();
      items.forEach((item) => state.set(item.id, item));
      listaItensCache.set(listaId, items);
      callback(items);
    })
    .catch((error) => console.error('Erro na carga inicial de itens:', error));

  const channel = supabase
    .channel(uniqueChannelName(`coleta-itens-${listaId}`))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'coleta_itens',
        filter: `lista_id=eq.${listaId}`,
      },
      (payload: any) => {
        if (!active) return;
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row?.id) return;

        if (payload.eventType === 'DELETE') state.delete(String(row.id));
        else state.set(String(row.id), mapItem(row));
        emit();
      }
    )
    .subscribe();

  return () => {
    active = false;
    if (emitTimer) clearTimeout(emitTimer);
    void supabase.removeChannel(channel);
  };
}

export function listenToActiveLista(
  listaId: string,
  callback: (lista: ColetaLista | null) => void
): () => void {
  if (!listaId) {
    callback(null);
    return () => {};
  }

  let active = true;

  getListaById(listaId).then((lista) => {
    if (active) callback(lista);
  });

  const channel = supabase
    .channel(uniqueChannelName(`active-lista-${listaId}`))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'coleta_listas',
        filter: `id=eq.${listaId}`,
      },
      (payload: any) => {
        if (!active) return;
        if (payload.eventType === 'DELETE') callback(null);
        else callback(mapLista(payload.new));
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function getListaById(
  listaId: string
): Promise<ColetaLista | null> {
  const { data, error } = await supabase
    .from('coleta_listas')
    .select('*')
    .eq('id', listaId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar lista no Supabase:', error);
    return null;
  }

  return data ? mapLista(data) : null;
}

export async function saveLista(
  lista: Partial<ColetaLista> & { id: string },
  _immediate = false
): Promise<boolean> {
  try {
    const { itens, ...metadata } = lista as any;

    const { error } = await supabase
      .from('coleta_listas')
      .upsert(listaToRow(metadata), { onConflict: 'id' });

    throwIfError(error, 'Erro ao salvar lista no Supabase');

    if (Array.isArray(itens) && itens.length > 0) {
      await addItemsBatchToLista(lista.id, itens);
    }

    return true;
  } catch (error) {
    console.error('Erro ao salvar lista:', error);
    return false;
  }
}

export async function flushSaveLista(_listaId: string): Promise<boolean> {
  return true;
}

export async function addItemToLista(
  listaId: string,
  item: Omit<ColetaItem, 'id'> & { id?: string }
): Promise<ColetaItem> {
  const row = itemToRow(listaId, item, item.id || undefined);

  const { data, error } = await supabase
    .from('coleta_itens')
    .upsert(row, { onConflict: 'lista_id,id' })
    .select('*')
    .single();

  throwIfError(error, 'Erro ao adicionar item no Supabase');
  return mapItem(data);
}

export async function updateItemInLista(
  listaId: string,
  itemId: string,
  updates: Partial<ColetaItem>,
  _prevItem?: Partial<ColetaItem>
): Promise<boolean> {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.codigo !== undefined) {
    payload.codigo = normalizeCodigo(updates.codigo);
    payload.codigo_clean = cleanDigits(updates.codigo);
  }
  if (updates.codigoClean !== undefined) payload.codigo_clean = updates.codigoClean;
  if (updates.rota !== undefined) payload.rota = updates.rota;
  if (updates.saida !== undefined) payload.saida = updates.saida;
  if (updates.motivo !== undefined) payload.motivo = updates.motivo;
  if (updates.scannedAt !== undefined) payload.scanned_at = updates.scannedAt;
  if (updates.responsavel !== undefined) payload.responsavel = updates.responsavel;
  if (updates.grupoId !== undefined) payload.grupo_id = updates.grupoId || null;
  if (updates.validado !== undefined) payload.validado = updates.validado;
  if (updates.timestamp !== undefined) payload.timestamp = updates.timestamp;

  const { error } = await supabase
    .from('coleta_itens')
    .update(payload)
    .eq('lista_id', listaId)
    .eq('id', itemId);

  if (error) {
    console.error('Erro ao atualizar item no Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteItemFromLista(
  listaId: string,
  itemId: string,
  _itemData?: Partial<ColetaItem>
): Promise<boolean> {
  const { error } = await supabase
    .from('coleta_itens')
    .delete()
    .eq('lista_id', listaId)
    .eq('id', itemId);

  if (error) {
    console.error('Erro ao excluir item no Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteItemsBatchFromLista(
  listaId: string,
  itemIds: string[]
): Promise<boolean> {
  if (!itemIds?.length) return true;

  try {
    for (let i = 0; i < itemIds.length; i += 500) {
      const chunk = itemIds.slice(i, i + 500);
      const { error } = await supabase
        .from('coleta_itens')
        .delete()
        .eq('lista_id', listaId)
        .in('id', chunk);

      throwIfError(error, 'Erro ao excluir lote no Supabase');
    }
    return true;
  } catch (error) {
    console.error('Erro ao excluir itens em lote:', error);
    return false;
  }
}

export async function addItemsBatchToLista(
  listaId: string,
  items: ColetaItem[]
): Promise<boolean> {
  if (!items?.length) return true;

  try {
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500).map((item) =>
        itemToRow(
          listaId,
          {
            ...item,
            timestamp: item.timestamp || Date.now() - i,
          },
          item.id || deterministicItemId(item.codigo)
        )
      );

      const { error } = await supabase
        .from('coleta_itens')
        .upsert(chunk, { onConflict: 'lista_id,id' });

      throwIfError(error, 'Erro no upsert em lote do Supabase');
    }

    await reconcileListaCounts(listaId);
    return true;
  } catch (error) {
    console.error('Erro ao adicionar itens em lote:', error);
    return false;
  }
}

export async function reconcileListaCounts(
  listaId: string
): Promise<{ totalItens: number; totalValidados: number }> {
  try {
    const { data, error } = await supabase.rpc('reconcile_lista_counts', {
      p_lista_id: listaId,
    });

    throwIfError(error, 'Erro ao reconciliar lista no Supabase');

    const result = Array.isArray(data) ? data[0] : data;
    return {
      totalItens: Number(result?.total_itens || 0),
      totalValidados: Number(result?.total_validados || 0),
    };
  } catch (error) {
    console.error('Erro ao reconciliar contadores:', error);
    return { totalItens: 0, totalValidados: 0 };
  }
}

export async function updateItemsBatchMotivo(
  listaId: string,
  itemIds: string[],
  novoMotivo: string
): Promise<boolean> {
  if (!itemIds?.length) return true;

  try {
    for (let i = 0; i < itemIds.length; i += 500) {
      const chunk = itemIds.slice(i, i + 500);
      const { error } = await supabase
        .from('coleta_itens')
        .update({
          motivo: novoMotivo,
          updated_at: new Date().toISOString(),
        })
        .eq('lista_id', listaId)
        .in('id', chunk);

      throwIfError(error, 'Erro ao atualizar motivos em lote');
    }
    return true;
  } catch (error) {
    console.error('Erro ao atualizar motivo em lote:', error);
    return false;
  }
}

export async function getItemsPage(
  listaId: string,
  pageSize = 100,
  cursorDoc: any | null = null,
  direction: 'next' | 'prev' = 'next'
): Promise<{
  items: ColetaItem[];
  firstDoc: any | null;
  lastDoc: any | null;
  count: number;
}> {
  try {
    let request = supabase
      .from('coleta_itens')
      .select('*')
      .eq('lista_id', listaId)
      .order('timestamp', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);

    if (cursorDoc?.timestamp) {
      if (direction === 'next') request = request.lt('timestamp', cursorDoc.timestamp);
      else request = request.gt('timestamp', cursorDoc.timestamp);
    }

    const { data, error } = await request;
    throwIfError(error, 'Erro ao buscar página de itens');

    const items = (data || []).map(mapItem);
    const firstDoc = items.length
      ? { timestamp: items[0].timestamp, id: items[0].id }
      : null;
    const last = items[items.length - 1];
    const lastDoc = last ? { timestamp: last.timestamp, id: last.id } : null;

    return { items, firstDoc, lastDoc, count: items.length };
  } catch (error) {
    console.error('Erro ao buscar página:', error);
    return { items: [], firstDoc: null, lastDoc: null, count: 0 };
  }
}

export async function searchItemsInLista(
  listaId: string,
  queryText: string,
  maxResults = 100
): Promise<ColetaItem[]> {
  const trimmed = normalizeCodigo(queryText);
  if (!trimmed) return [];

  const found = new Map<string, ColetaItem>();

  try {
    const { data: exact } = await supabase
      .from('coleta_itens')
      .select('*')
      .eq('lista_id', listaId)
      .eq('codigo', trimmed)
      .limit(maxResults);

    (exact || []).forEach((row) => {
      const item = mapItem(row);
      found.set(item.id, item);
    });

    const clean = cleanDigits(trimmed);
    if (clean && found.size < maxResults) {
      const { data: cleanRows } = await supabase
        .from('coleta_itens')
        .select('*')
        .eq('lista_id', listaId)
        .eq('codigo_clean', clean)
        .limit(maxResults - found.size);

      (cleanRows || []).forEach((row) => {
        const item = mapItem(row);
        found.set(item.id, item);
      });
    }

    if (found.size < maxResults) {
      const safePrefix = trimmed.replace(/[%_]/g, '\\$&');
      const { data: prefix } = await supabase
        .from('coleta_itens')
        .select('*')
        .eq('lista_id', listaId)
        .ilike('codigo', `${safePrefix}%`)
        .limit(maxResults - found.size);

      (prefix || []).forEach((row) => {
        const item = mapItem(row);
        found.set(item.id, item);
      });
    }

    return Array.from(found.values()).slice(0, maxResults);
  } catch (error) {
    console.error('Erro na pesquisa de itens:', error);
    return [];
  }
}

export async function searchItemsAcrossAllListas(
  terms: string[]
): Promise<Map<string, { item: ColetaItem; listaId: string }>> {
  const results = new Map<string, { item: ColetaItem; listaId: string }>();
  const normalized = Array.from(
    new Set(terms.map(normalizeCodigo).filter(Boolean))
  );

  try {
    for (let i = 0; i < normalized.length; i += 100) {
      const chunk = normalized.slice(i, i + 100);
      const cleanChunk = Array.from(new Set(chunk.map(cleanDigits).filter(Boolean)));

      const { data: codeRows, error: codeError } = await supabase
        .from('coleta_itens')
        .select('*')
        .in('codigo', chunk);

      throwIfError(codeError, 'Erro ao buscar códigos no Supabase');

      for (const row of codeRows || []) {
        const item = mapItem(row);
        const entry = { item, listaId: String(row.lista_id) };
        results.set(item.codigo.toUpperCase(), entry);
        if (item.codigoClean) results.set(item.codigoClean, entry);
      }

      if (cleanChunk.length) {
        const { data: cleanRows, error: cleanError } = await supabase
          .from('coleta_itens')
          .select('*')
          .in('codigo_clean', cleanChunk);

        throwIfError(cleanError, 'Erro ao buscar códigos limpos no Supabase');

        for (const row of cleanRows || []) {
          const item = mapItem(row);
          const entry = { item, listaId: String(row.lista_id) };
          if (!results.has(item.codigo.toUpperCase())) {
            results.set(item.codigo.toUpperCase(), entry);
          }
          if (item.codigoClean && !results.has(item.codigoClean)) {
            results.set(item.codigoClean, entry);
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao pesquisar em todas as listas:', error);
  }

  return results;
}

export async function getAllItemsForExport(
  listaId: string
): Promise<ColetaItem[]> {
  try {
    return await loadListaItens(listaId, 10000);
  } catch (error) {
    console.error('Erro ao buscar itens para exportação:', error);
    return [];
  }
}

export async function getItemsOfGrupo(
  listaId: string,
  grupoId: string
): Promise<ColetaItem[]> {
  const { data, error } = await supabase
    .from('coleta_itens')
    .select('*')
    .eq('lista_id', listaId)
    .eq('grupo_id', grupoId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Erro ao buscar itens do grupo:', error);
    return [];
  }

  return (data || []).map(mapItem);
}

export async function deleteLista(listaId: string): Promise<boolean> {
  const { error } = await supabase
    .from('coleta_listas')
    .delete()
    .eq('id', listaId);

  if (error) {
    console.error('Erro ao excluir lista no Supabase:', error);
    return false;
  }

  listaItensCache.delete(listaId);
  return true;
}

export async function migrateLegacyListasToSubcollections(): Promise<{
  migratedLists: number;
  migratedItems: number;
}> {
  return { migratedLists: 0, migratedItems: 0 };
}

export async function syncListaToGoogleSheets(
  listaId: string
): Promise<{ success: boolean; synced: number }> {
  try {
    const token = await getSupabaseAccessToken();
    const res = await fetch('/api/sheets?action=sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ listaId }),
    });

    const data = await res.json();

    if (data?.data?.notConfigured || data?.notConfigured) {
      return { success: false, synced: 0 };
    }

    const body = data?.data || data;
    if (!res.ok || body?.success === false) {
      throw new Error(body?.message || 'Erro ao sincronizar com Google Sheets');
    }

    return {
      success: true,
      synced: Number(body?.synced || 0),
    };
  } catch (error) {
    console.warn('Falha ao sincronizar Google Sheets:', error);
    return { success: false, synced: 0 };
  }
}
