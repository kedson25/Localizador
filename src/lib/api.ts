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

// Obtém o token de autenticação atual do localStorage (ou Firebase Auth)
function getAuthToken(): string | null {
  try {
    const savedUser = localStorage.getItem('app_current_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      if (parsed.token) return parsed.token;
      if (parsed.id) return `user_${parsed.id}`;
    }
  } catch (_) {}
  return null;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Resposta inválida do servidor (${response.status}): ${text.slice(0, 100)}`);
  }

  if (!response.ok || json.ok === false) {
    const errMessage = json?.error?.message || json?.error || `Erro na requisição: ${response.status}`;
    const error = new Error(errMessage);
    (error as any).code = json?.error?.code || 'API_ERROR';
    (error as any).details = json?.error?.details;
    throw error;
  }

  return json.data;
}

/**
 * BIP DE PACOTE — PRIORIDADE MÁXIMA
 * Operação atômica O(1) no servidor
 */
export async function apiBipItem(payload: BipPayload): Promise<BipResult> {
  return apiRequest<BipResult>('/api/coleta/bip', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Atualização unitária de um item
 */
export async function apiUpdateItem(
  listaId: string,
  itemId: string,
  changes: Partial<ColetaItem>
): Promise<ColetaItem> {
  return apiRequest<ColetaItem>('/api/coleta/item', {
    method: 'PATCH',
    body: JSON.stringify({ listaId, itemId, changes }),
  });
}

/**
 * Exclusão unitária de um item
 */
export async function apiDeleteItem(
  listaId: string,
  itemId: string
): Promise<{ deleted: boolean; itemId: string }> {
  return apiRequest<{ deleted: boolean; itemId: string }>('/api/coleta/item', {
    method: 'DELETE',
    body: JSON.stringify({ listaId, itemId }),
  });
}

/**
 * Paginação server-side real de itens
 */
export async function apiGetItemsPage(
  params: QueryItemsParams
): Promise<PaginatedItemsResult> {
  const query = new URLSearchParams();
  query.set('listaId', params.listaId);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.direction) query.set('direction', params.direction);
  if (params.saida) query.set('saida', params.saida);
  if (params.motivo) query.set('motivo', params.motivo);
  if (params.validado) query.set('validado', params.validado);
  if (params.order) query.set('order', params.order);

  return apiRequest<PaginatedItemsResult>(`/api/coleta/items?${query.toString()}`);
}

/**
 * Pesquisa global por código do pacote
 */
export async function apiSearchItems(
  listaId: string,
  q: string,
  limit = 50
): Promise<{ items: ColetaItem[] }> {
  const query = new URLSearchParams({ listaId, q, limit: String(limit) });
  return apiRequest<{ items: ColetaItem[] }>(`/api/coleta/search?${query.toString()}`);
}

/**
 * Importação em lote escalável
 */
export async function apiBatchImport(
  listaId: string,
  items: Partial<ColetaItem>[],
  overwrite = false
): Promise<BatchSummary> {
  return apiRequest<BatchSummary>('/api/coleta/batch', {
    method: 'POST',
    body: JSON.stringify({ listaId, items, overwrite }),
  });
}

/**
 * Obter contadores e estatísticas em tempo real
 */
export async function apiGetListaStats(listaId: string): Promise<any> {
  return apiRequest<any>(`/api/coleta/stats?listaId=${encodeURIComponent(listaId)}`);
}

/**
 * Listas - Listar todas (apenas metadados)
 */
export async function apiGetListas(): Promise<{ listas: ColetaLista[] }> {
  return apiRequest<{ listas: ColetaLista[] }>('/api/listas');
}

/**
 * Criar nova lista
 */
export async function apiCreateLista(lista: Partial<ColetaLista>): Promise<ColetaLista> {
  return apiRequest<ColetaLista>('/api/listas', {
    method: 'POST',
    body: JSON.stringify(lista),
  });
}

/**
 * Atualizar metadados da lista
 */
export async function apiUpdateListaMeta(
  listaId: string,
  updates: Partial<ColetaLista>
): Promise<ColetaLista> {
  return apiRequest<ColetaLista>(`/api/listas/${encodeURIComponent(listaId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Reconciliar e ressincronizar contadores das listas com contagem exata no servidor
 */
export async function apiReconcileListas(listaId?: string): Promise<{ reconciled: Array<{ id: string; nome: string; totalItens: number; totalValidados: number }> }> {
  return apiRequest<{ reconciled: Array<{ id: string; nome: string; totalItens: number; totalValidados: number }> }>('/api/listas/reconcile', {
    method: 'POST',
    body: JSON.stringify(listaId ? { listaId } : {}),
  });
}

/**
 * Excluir lista e todos os seus itens
 */
export async function apiDeleteLista(listaId: string): Promise<any> {
  return apiRequest<any>(`/api/listas/${encodeURIComponent(listaId)}`, {
    method: 'DELETE',
  });
}

/**
 * Autenticação - Login
 */
export async function apiAuthLogin(emailOrUsername: string, password: string): Promise<any> {
  return apiRequest<any>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password }),
  });
}

/**
 * Autenticação - Cadastro
 */
export async function apiAuthSignup(username: string, email: string, password: string): Promise<any> {
  return apiRequest<any>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

/**
 * Autenticação - Listar usuários
 */
export async function apiGetUsers(): Promise<{ users: any[] }> {
  return apiRequest<{ users: any[] }>('/api/auth/users');
}

/**
 * Autenticação - Atualizar status do usuário
 */
export async function apiUpdateUser(userId: string, updates: any): Promise<any> {
  return apiRequest<any>('/api/auth/users', {
    method: 'PATCH',
    body: JSON.stringify({ userId, updates }),
  });
}

/**
 * Refugo - Obter scans
 */
export async function apiGetRefugoScans(): Promise<{ scans: any[] }> {
  return apiRequest<{ scans: any[] }>('/api/refugo/scans');
}

/**
 * Refugo - Salvar scan atômico
 */
export async function apiSaveRefugoScan(scan: { id: string; rota?: string; status?: string; foundBy?: string }): Promise<any> {
  return apiRequest<any>('/api/refugo/scans', {
    method: 'POST',
    body: JSON.stringify(scan),
  });
}

/**
 * Refugo - Limpar scans
 */
export async function apiClearRefugoScans(): Promise<any> {
  return apiRequest<any>('/api/refugo/scans', {
    method: 'DELETE',
  });
}
