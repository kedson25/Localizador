import { supabase } from '../lib/supabase';
import { asJson, type BaseRow } from '../lib/database.types';
import { databaseOperation, DataError } from './errors';
import { createLiveQuery } from './realtime.service';

export interface RefugoData { rawText: string; totalRows: number; updatedAt: string; fileName: string; revision: number }
export type ColetorData = RefugoData;
export interface RefugoScan { id: string; rota: string; scannedAt: string; status: 'found' | 'not_found'; foundBy?: string; generation?: string | null; firebase_uid?: string; user_name?: string; user_email?: string; created_at?: string }
type Kind = 'coletor' | 'refugo';
const baseData = (row: BaseRow | null): RefugoData | null => row ? {
  rawText: row.raw_text, totalRows: row.total_rows, updatedAt: row.updated_at, fileName: row.file_name, revision: row.revision,
} : null;
async function loadBase(kind: Kind) {
  return baseData(await databaseOperation(`base:${kind}:read`, () => supabase.from('bases_operacionais').select('*').eq('kind', kind).maybeSingle()));
}
const bases = {
  coletor: createLiveQuery('coletor', [{ table: 'bases_operacionais', filter: 'kind=eq.coletor' }], () => loadBase('coletor')),
  refugo: createLiveQuery('refugo', [{ table: 'bases_operacionais', filter: 'kind=eq.refugo' }], () => loadBase('refugo')),
};
async function saveBase(kind: Kind, rawText: string, totalRows: number, fileName: string) {
  const current = bases[kind].current();
  const existing = current === undefined ? await loadBase(kind) : current;
  try {
    return await databaseOperation(`base:${kind}:write`, () => supabase.rpc('upsert_operational_base', {
      p_kind: kind, p_raw_text: rawText, p_total_rows: totalRows, p_file_name: fileName, p_expected_revision: existing?.revision ?? null,
    }));
  } finally { bases[kind].refresh(); if (kind === 'refugo') scansLive.refresh(); }
}
async function clearBase(kind: Kind) {
  const current = bases[kind].current();
  const existing = current === undefined ? await loadBase(kind) : current;
  try {
    return await databaseOperation(`base:${kind}:write`, () => supabase.rpc('clear_operational_base', { p_kind: kind, p_expected_revision: existing?.revision ?? null }));
  } finally { bases[kind].refresh(); if (kind === 'refugo') scansLive.refresh(); }
}
export const saveRefugo = (rawText: string, totalRows: number, fileName = 'refugo.csv') => saveBase('refugo', rawText, totalRows, fileName);
export const loadRefugo = () => loadBase('refugo');
export const clearRefugo = () => clearBase('refugo');
export const listenToRefugo = bases.refugo.subscribe;
export const saveToColetor = (rawText: string, totalRows: number, fileName = 'relatorio.csv') => saveBase('coletor', rawText, totalRows, fileName);
export const loadFromColetor = () => loadBase('coletor');
export const clearColetor = () => clearBase('coletor');
export const listenToColetor = bases.coletor.subscribe;

export function refugoScanKey(id: string) { const normalized = id.trim().toUpperCase(); return normalized.replace(/\D/g, '') || normalized.replace(/M$/, ''); }
async function loadScans() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await databaseOperation('refugoScans:read', () => supabase.from('refugo_state').select('generation').eq('id', 'current').single());
    const generation = state.generation;
    const scans: RefugoScan[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from('refugo_scans').select('*').order('id').range(offset, offset + 499);
      query = generation === null ? query.is('generation', null) : query.eq('generation', generation);
      const batch = await databaseOperation('refugoScans:read', () => query);
      for (const row of batch || []) scans.push({ ...(row.payload as unknown as RefugoScan), generation: row.generation,
        firebase_uid: row.firebase_uid, user_name: row.user_name, user_email: row.user_email, created_at: row.created_at });
      if (!batch || batch.length < 500) break;
    }
    const after = await databaseOperation('refugoScans:read', () => supabase.from('refugo_state').select('generation').eq('id', 'current').single());
    if (after.generation === generation) return { scans: scans.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)), generation };
  }
  throw new DataError('conflict', 'A base de refugo foi substituída. Aguarde a atualização e tente novamente.');
}
const scansLive = createLiveQuery('refugoScans', [{ table: 'refugo_scans' }, { table: 'refugo_state' }], () => loadScans());
export async function saveRefugoScan(scan: RefugoScan, generation: string | null): Promise<boolean> {
  return databaseOperation('refugoScans:write', () => supabase.rpc('mutate_refugo_scans', { p_scans: asJson([scan]), p_generation: generation }))
    .finally(() => { scansLive.refresh(); });
}
export async function saveRefugoScans(scans: RefugoScan[]): Promise<boolean> {
  const current = await loadScans();
  const existing = new Set(current.scans.map(scan => refugoScanKey(scan.id)));
  const additions = scans.filter(scan => !existing.has(refugoScanKey(scan.id)));
  if (!additions.length) return true;
  try { return await databaseOperation('refugoScans:write', () => supabase.rpc('mutate_refugo_scans', { p_scans: asJson(additions), p_generation: current.generation })); }
  finally { scansLive.refresh(); }
}
export async function loadRefugoScans(): Promise<RefugoScan[]> { return (await loadScans()).scans; }
export async function clearRefugoScans(): Promise<boolean> {
  try { return await databaseOperation('refugoScans:write', () => supabase.rpc('reset_refugo_scans', {})); }
  finally { scansLive.refresh(); }
}
export function listenToRefugoScans(callback: (scans: RefugoScan[], generation: string | null) => void, onError?: (error: Error) => void) {
  return scansLive.subscribe(state => callback(state.scans, state.generation), onError);
}
export function validateAndCleanIds(rawInputs: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of rawInputs) {
    if (!raw) continue;
    let value = String(raw).trim().replace(/d[çc]?⁴/gi, '4').replace(/d[çc]?4/gi, '4').replace(/^[^0-9a-zA-Z]+/, '');
    const match = value.match(/(47\d+)/);
    value = (match ? match[1] : value.replace(/m$/i, '')).toUpperCase();
    if (value.length >= 3) unique.add(value);
  }
  return [...unique];
}
