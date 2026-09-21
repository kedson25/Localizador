import { getSupabaseAccessToken } from './supabase';
import { loginUser, signupUser } from './auth';
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

async function apiRequest<T>(
  input: string,
  init: RequestInit = {},
  authenticated = true
): Promise<T> {
  const token = authenticated ? await getSupabaseAccessToken() : null;
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch (_) {
    throw new Error(`Resposta inválida do servidor (${response.status})`);
  }

  if (!response.ok || body?.ok === false) {
    throw new Error(
      body?.error?.message || `Erro HTTP ${response.status} ao acessar ${input}`
    );
  }

  return (body?.data ?? body) as T;
}

function withQuery(base: string, params: Record<string, any>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${base}&${query}` : base;
}

export async function apiBipItem(payload: BipPayload): Promise<BipResult> {
  return apiRequest<BipResult>('/api/coleta?action=bip', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateItem(
  listaId: string,
  itemId: string,
  changes: Partial<ColetaItem>
): Promise<ColetaItem> {
  return apiRequest<ColetaItem>('/api/coleta?action=item', {
    method: 'PATCH',
    body: JSON.stringify({ listaId, itemId, changes }),
  });
}

export async function apiDeleteItem(
  listaId: string,
  itemId: string
): Promise<{ deleted: boolean; itemId: string }> {
  return apiRequest('/api/coleta?action=item', {
    method: 'DELETE',
    body: JSON.stringify({ listaId, itemId }),
  });
}

export async function apiGetItemsPage(
  params: QueryItemsParams
): Promise<PaginatedItemsResult> {
  return apiRequest<PaginatedItemsResult>(
    withQuery('/api/coleta?action=items', params),
    { method: 'GET' }
  );
}

export async function apiSearchItems(
  listaId: string,
  q: string,
  limit = 50
): Promise<{ items: ColetaItem[] }> {
  return apiRequest<{ items: ColetaItem[] }>(
    withQuery('/api/coleta?action=search', { listaId, q, limit }),
    { method: 'GET' }
  );
}

export async function apiBatchImport(
  listaId: string,
  items: Partial<ColetaItem>[],
  overwrite = false
): Promise<BatchSummary> {
  return apiRequest<BatchSummary>('/api/coleta?action=batch', {
    method: 'POST',
    body: JSON.stringify({ listaId, items, overwrite }),
  });
}

export async function apiGetListaStats(listaId: string): Promise<any> {
  return apiRequest(
    withQuery('/api/coleta?action=stats', { listaId }),
    { method: 'GET' }
  );
}

export async function apiGetListas(): Promise<{ listas: ColetaLista[] }> {
  return apiRequest<{ listas: ColetaLista[] }>('/api/listas?action=index', {
    method: 'GET',
  });
}

export async function apiCreateLista(
  lista: Partial<ColetaLista>
): Promise<ColetaLista> {
  return apiRequest<ColetaLista>('/api/listas?action=index', {
    method: 'POST',
    body: JSON.stringify(lista),
  });
}

export async function apiUpdateListaMeta(
  listaId: string,
  updates: Partial<ColetaLista>
): Promise<ColetaLista> {
  return apiRequest<ColetaLista>(
    withQuery('/api/listas?action=id', { id: listaId }),
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

export async function apiDeleteLista(listaId: string): Promise<any> {
  return apiRequest(
    withQuery('/api/listas?action=id', { id: listaId }),
    { method: 'DELETE' }
  );
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
  return apiRequest('/api/listas?action=reconcile', {
    method: 'POST',
    body: JSON.stringify({ listaId }),
  });
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
  return apiRequest<{ users: any[] }>('/api/auth?action=users', {
    method: 'GET',
  });
}

export async function apiUpdateUser(
  userId: string,
  updates: any
): Promise<any> {
  return apiRequest('/api/auth?action=users', {
    method: 'PATCH',
    body: JSON.stringify({ userId, updates }),
  });
}

export async function apiDeleteUser(userId: string): Promise<any> {
  return apiRequest('/api/auth?action=users', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

export async function apiGetRefugoScans(): Promise<{ scans: any[] }> {
  return apiRequest<{ scans: any[] }>('/api/refugo?action=scans', {
    method: 'GET',
  });
}

export async function apiSaveRefugoScan(scan: {
  id: string;
  rota?: string;
  status?: string;
  foundBy?: string;
}): Promise<any> {
  return apiRequest('/api/refugo?action=scans', {
    method: 'POST',
    body: JSON.stringify(scan),
  });
}

export async function apiClearRefugoScans(): Promise<any> {
  return apiRequest('/api/refugo?action=scans', {
    method: 'DELETE',
  });
}
