import { getAuth } from 'firebase/auth';
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

async function getAuthToken(): Promise<string | null> {
  try {
    const current = getAuth().currentUser;
    if (current) return await current.getIdToken();
  } catch (_) {}

  try {
    const savedUser = localStorage.getItem('app_current_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      if (parsed.token) return parsed.token;
    }
  } catch (_) {}

  return null;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, { ...options, headers });
  const text = await response.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do servidor (${response.status})`);
  }

  if (!response.ok || json.ok === false) {
    const message = json?.error?.message || `Erro na requisição: ${response.status}`;
    const error = new Error(message);
    (error as any).code = json?.error?.code || 'API_ERROR';
    (error as any).details = json?.error?.details;
    throw error;
  }

  return json.data;
}

export async function apiBipItem(payload: BipPayload): Promise<BipResult> {
  return apiRequest<BipResult>('/api/coleta?action=bip', { method: 'POST', body: JSON.stringify(payload) });
}

export async function apiUpdateItem(listaId: string, itemId: string, changes: Partial<ColetaItem>): Promise<ColetaItem> {
  return apiRequest<ColetaItem>('/api/coleta?action=item', {
    method: 'PATCH',
    body: JSON.stringify({ listaId, itemId, changes }),
  });
}

export async function apiDeleteItem(listaId: string, itemId: string): Promise<{ deleted: boolean; itemId: string }> {
  return apiRequest('/api/coleta?action=item', {
    method: 'DELETE',
    body: JSON.stringify({ listaId, itemId }),
  });
}

export async function apiGetItemsPage(params: QueryItemsParams): Promise<PaginatedItemsResult> {
  const query = new URLSearchParams();
  query.set('listaId', params.listaId);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.direction) query.set('direction', params.direction);
  if (params.saida) query.set('saida', params.saida);
  if (params.motivo) query.set('motivo', params.motivo);
  if (params.validado) query.set('validado', params.validado);
  if (params.order) query.set('order', params.order);
  return apiRequest(`/api/coleta?action=items&${query.toString()}`);
}

export async function apiSearchItems(listaId: string, q: string, limit = 50): Promise<{ items: ColetaItem[] }> {
  const query = new URLSearchParams({ listaId, q, limit: String(limit) });
  return apiRequest(`/api/coleta?action=search&${query.toString()}`);
}

export async function apiBatchImport(listaId: string, items: Partial<ColetaItem>[], overwrite = false): Promise<BatchSummary> {
  return apiRequest('/api/coleta?action=batch', {
    method: 'POST',
    body: JSON.stringify({ listaId, items, overwrite }),
  });
}

export async function apiGetListaStats(listaId: string): Promise<any> {
  return apiRequest(`/api/coleta?action=stats&listaId=${encodeURIComponent(listaId)}`);
}

export async function apiGetListas(): Promise<{ listas: ColetaLista[] }> {
  return apiRequest('/api/listas?action=index');
}

export async function apiCreateLista(lista: Partial<ColetaLista>): Promise<ColetaLista> {
  return apiRequest('/api/listas?action=index', { method: 'POST', body: JSON.stringify(lista) });
}

export async function apiUpdateListaMeta(listaId: string, updates: Partial<ColetaLista>): Promise<ColetaLista> {
  return apiRequest(`/api/listas?action=id&id=${encodeURIComponent(listaId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function apiReconcileListas(listaId?: string): Promise<{ reconciled: Array<{ id: string; nome: string; totalItens: number; totalValidados: number }> }> {
  return apiRequest('/api/listas?action=reconcile', {
    method: 'POST',
    body: JSON.stringify(listaId ? { listaId } : {}),
  });
}

export async function apiDeleteLista(listaId: string): Promise<any> {
  return apiRequest(`/api/listas?action=id&id=${encodeURIComponent(listaId)}`, { method: 'DELETE' });
}

export async function apiAuthLogin(emailOrUsername: string, password: string): Promise<any> {
  return apiRequest('/api/auth?action=login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password }),
  });
}

export async function apiAuthSignup(username: string, email: string, password: string): Promise<any> {
  return apiRequest('/api/auth?action=signup', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export async function apiGetUsers(): Promise<{ users: any[] }> {
  return apiRequest('/api/auth?action=users');
}

export async function apiUpdateUser(userId: string, updates: any): Promise<any> {
  return apiRequest('/api/auth?action=users', {
    method: 'PATCH',
    body: JSON.stringify({ userId, updates }),
  });
}

export async function apiGetRefugoScans(): Promise<{ scans: any[] }> {
  return apiRequest('/api/refugo?action=scans');
}

export async function apiSaveRefugoScan(scan: { id: string; rota?: string; status?: string; foundBy?: string }): Promise<any> {
  return apiRequest('/api/refugo?action=scans', { method: 'POST', body: JSON.stringify(scan) });
}

export async function apiClearRefugoScans(): Promise<any> {
  return apiRequest('/api/refugo?action=scans', { method: 'DELETE' });
}
