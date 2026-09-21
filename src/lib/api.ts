import { supabase } from './supabase';
import {
  addItemToLista,
  updateItemInLista,
  deleteItemFromLista,
  searchItemsInLista,
  addItemsBatchToLista,
  getListaById,
  saveLista,
  reconcileListaCounts,
  deleteLista,
  addRefugoScan,
  clearRefugoScans,
} from './firebase';
import {
  loginUser,
  signupUser,
  getAllUsers,
  updateUserAdminStatus,
} from './auth';
import { ColetaItem, ColetaLista } from '../types';

export interface BipPayload {
  listaId: string;
  codigo: string;
  saida?: string;
  motivo?: string;
  rota?: string;
  responsavel?: string;
  grupoId?: string;
}

export interface BipResult {
  item: ColetaItem;
  isNew: boolean;
}

export interface QueryItemsParams {
  listaId: string;
  limit?: number;
  cursor?: string;
  direction?: 'next' | 'prev';
  saida?: string;
  motivo?: string;
  validado?: 'true' | 'false';
  order?: 'asc' | 'desc';
}

export interface PaginatedItemsResult {
  items: ColetaItem[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  total: number;
  pageSize: number;
}

export interface BatchSummary {
  received: number;
  inserted: number;
  updated: number;
  duplicates: number;
  failed: number;
}

function rowToItem(row: any): ColetaItem {
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

function rowToLista(row: any): ColetaLista {
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

export async function apiBipItem(payload: BipPayload): Promise<BipResult> {
  const codigo = String(payload.codigo || '').trim().toUpperCase();
  if (!payload.listaId || !codigo) {
    throw new Error('Lista e código são obrigatórios.');
  }

  const existing = (await searchItemsInLista(payload.listaId, codigo, 10)).find(
    (item) => item.codigo.trim().toUpperCase() === codigo
  );

  const item = await addItemToLista(payload.listaId, {
    ...(existing ? { id: existing.id } : {}),
    codigo,
    rota: payload.rota || existing?.rota || 'Sem Rota',
    saida: payload.saida || existing?.saida || 'Ciclo 2 - Saída PM',
    motivo: payload.motivo || existing?.motivo || 'Pendente',
    scannedAt: new Date().toLocaleString('pt-BR'),
    responsavel: payload.responsavel || existing?.responsavel || 'Operador',
    grupoId: payload.grupoId || existing?.grupoId,
    validado: existing?.validado ?? false,
    timestamp: Date.now(),
  });

  return { item, isNew: !existing };
}

export async function apiUpdateItem(
  listaId: string,
  itemId: string,
  changes: Partial<ColetaItem>
): Promise<ColetaItem> {
  const ok = await updateItemInLista(listaId, itemId, changes);
  if (!ok) throw new Error('Não foi possível atualizar o item.');

  const { data, error } = await supabase
    .from('coleta_itens')
    .select('*')
    .eq('lista_id', listaId)
    .eq('id', itemId)
    .single();

  if (error) throw error;
  return rowToItem(data);
}

export async function apiDeleteItem(
  listaId: string,
  itemId: string
): Promise<{ deleted: boolean; itemId: string }> {
  const deleted = await deleteItemFromLista(listaId, itemId);
  if (!deleted) throw new Error('Não foi possível excluir o item.');
  return { deleted: true, itemId };
}

export async function apiGetItemsPage(
  params: QueryItemsParams
): Promise<PaginatedItemsResult> {
  const pageSize = Math.max(1, Math.min(params.limit || 100, 500));
  let offset = Number.parseInt(params.cursor || '0', 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  if (params.direction === 'prev') {
    offset = Math.max(0, offset - pageSize);
  }

  const applyFilters = (query: any) => {
    let filtered = query.eq('lista_id', params.listaId);
    if (params.saida) filtered = filtered.eq('saida', params.saida);
    if (params.motivo) filtered = filtered.eq('motivo', params.motivo);
    if (params.validado) {
      filtered = filtered.eq('validado', params.validado === 'true');
    }
    return filtered;
  };

  const dataQuery = applyFilters(
    supabase.from('coleta_itens').select('*')
  )
    .order('timestamp', { ascending: params.order === 'asc' })
    .order('id', { ascending: params.order === 'asc' })
    .range(offset, offset + pageSize - 1);

  const countQuery = applyFilters(
    supabase.from('coleta_itens').select('*', { count: 'exact', head: true })
  );

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    dataQuery,
    countQuery,
  ]);

  if (error) throw error;
  if (countError) throw countError;

  const total = count || 0;
  const items = (data || []).map(rowToItem);
  const nextOffset = offset + pageSize;
  const hasMore = nextOffset < total;

  return {
    items,
    nextCursor: hasMore ? String(nextOffset) : null,
    prevCursor: offset > 0 ? String(Math.max(0, offset - pageSize)) : null,
    hasMore,
    total,
    pageSize,
  };
}

export async function apiSearchItems(
  listaId: string,
  q: string,
  limit = 50
): Promise<{ items: ColetaItem[] }> {
  return { items: await searchItemsInLista(listaId, q, limit) };
}

export async function apiBatchImport(
  listaId: string,
  items: Partial<ColetaItem>[],
  _overwrite = false
): Promise<BatchSummary> {
  const normalized: ColetaItem[] = items
    .filter((item) => String(item.codigo || '').trim())
    .map((item, index) => ({
      id: item.id || '',
      codigo: String(item.codigo || '').trim().toUpperCase(),
      rota: item.rota || 'Sem Rota',
      saida: item.saida || 'Ciclo 2 - Saída PM',
      motivo: item.motivo || 'Pendente',
      scannedAt: item.scannedAt || new Date().toLocaleString('pt-BR'),
      responsavel: item.responsavel || 'Importação',
      grupoId: item.grupoId,
      validado: item.validado === true,
      timestamp: item.timestamp || Date.now() - index,
      codigoClean: item.codigoClean,
    }));

  const ok = await addItemsBatchToLista(listaId, normalized);
  if (!ok) {
    return {
      received: items.length,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      failed: items.length,
    };
  }

  return {
    received: items.length,
    inserted: normalized.length,
    updated: 0,
    duplicates: Math.max(0, items.length - normalized.length),
    failed: 0,
  };
}

export async function apiGetListaStats(listaId: string): Promise<any> {
  const lista = await getListaById(listaId);
  if (!lista) throw new Error('Lista não encontrada.');

  return {
    listaId,
    totalItens: lista.totalItens || 0,
    totalValidados: lista.totalValidados || 0,
    totalPendentes: Math.max(
      0,
      (lista.totalItens || 0) - (lista.totalValidados || 0)
    ),
    saidasCount: lista.saidasCount || {},
    motivosCount: lista.motivosCount || {},
    rotasCount: lista.rotasCount || {},
    bipsPorOperador: lista.bipsPorOperador || {},
  };
}

export async function apiGetListas(): Promise<{ listas: ColetaLista[] }> {
  const { data, error } = await supabase
    .from('coleta_listas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { listas: (data || []).map(rowToLista) };
}

export async function apiCreateLista(
  lista: Partial<ColetaLista>
): Promise<ColetaLista> {
  const id = lista.id || `lista-${Date.now()}`;
  const payload = {
    ...lista,
    id,
    nome: lista.nome || `Lista ${new Date().toLocaleDateString('pt-BR')}`,
    rota: lista.rota || '',
    data: lista.data || new Date().toLocaleDateString('pt-BR'),
    responsavel: lista.responsavel || 'Operador',
    status: lista.status || 'em_andamento',
    saidaPadrao: lista.saidaPadrao || 'Ciclo 2 - Saída PM',
    motivoPadrao: lista.motivoPadrao || 'Pendente',
  } as ColetaLista;

  const ok = await saveLista(payload);
  if (!ok) throw new Error('Não foi possível criar a lista.');

  const saved = await getListaById(id);
  if (!saved) throw new Error('Lista criada, mas não foi possível recarregá-la.');
  return saved;
}

export async function apiUpdateListaMeta(
  listaId: string,
  updates: Partial<ColetaLista>
): Promise<ColetaLista> {
  const ok = await saveLista({ ...updates, id: listaId });
  if (!ok) throw new Error('Não foi possível atualizar a lista.');

  const saved = await getListaById(listaId);
  if (!saved) throw new Error('Lista não encontrada.');
  return saved;
}

export async function apiReconcileListas(
  listaId?: string
): Promise<{
  reconciled: Array<{
    id: string;
    nome: string;
    totalItens: number;
    totalValidados: number;
  }>;
}> {
  const { data, error } = listaId
    ? await supabase
        .from('coleta_listas')
        .select('id, nome')
        .eq('id', listaId)
    : await supabase.from('coleta_listas').select('id, nome');

  if (error) throw error;

  const reconciled = [];
  for (const lista of data || []) {
    const counts = await reconcileListaCounts(String(lista.id));
    reconciled.push({
      id: String(lista.id),
      nome: String(lista.nome || ''),
      ...counts,
    });
  }

  return { reconciled };
}

export async function apiDeleteLista(listaId: string): Promise<any> {
  const deleted = await deleteLista(listaId);
  if (!deleted) throw new Error('Não foi possível excluir a lista.');
  return { deleted: true, listaId };
}

export async function apiAuthLogin(
  emailOrUsername: string,
  password: string
): Promise<any> {
  const result = await loginUser(emailOrUsername, password);
  if (!result.success) throw new Error(result.message || 'Credenciais inválidas');
  return { user: result.user };
}

export async function apiAuthSignup(
  username: string,
  email: string,
  password: string
): Promise<any> {
  const result = await signupUser(username, email, password);
  if (!result.success) throw new Error(result.message || 'Falha no cadastro');
  return { message: result.message };
}

export async function apiGetUsers(): Promise<{ users: any[] }> {
  return { users: await getAllUsers() };
}

export async function apiUpdateUser(
  userId: string,
  updates: any
): Promise<any> {
  const updated = await updateUserAdminStatus(userId, updates);
  if (!updated) throw new Error('Não foi possível atualizar o usuário.');
  return { updated: true, userId };
}

export async function apiGetRefugoScans(): Promise<{ scans: any[] }> {
  const { data, error } = await supabase
    .from('refugo_scans')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return { scans: data || [] };
}

export async function apiSaveRefugoScan(scan: {
  id: string;
  rota?: string;
  status?: string;
  foundBy?: string;
}): Promise<any> {
  const normalizedId = String(scan.id || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  await addRefugoScan({
    id: scan.id,
    normalizedId,
    rota: scan.rota || '',
    scannedAt: new Date().toLocaleString('pt-BR'),
    timestamp: Date.now(),
    status: scan.status === 'not_found' ? 'not_found' : 'found',
    foundBy: scan.foundBy,
  });

  return { saved: true, normalizedId };
}

export async function apiClearRefugoScans(): Promise<any> {
  const cleared = await clearRefugoScans();
  return { cleared };
}
