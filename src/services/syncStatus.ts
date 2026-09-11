export type SyncState = 'Sincronizado' | 'Sincronizando...' | 'Sem conexão' | 'Erro de sincronização';
export interface SyncStatus { state: SyncState; pending: number; error?: string; lastSyncTime: string | null }
const listeners = new Set<(status: SyncStatus) => void>();
const operations = new Set<symbol>();
const failures = new Map<string, string>();
const connections = new Map<string, boolean>();
let lastSyncTime: string | null = null;
let online = typeof navigator === 'undefined' || navigator.onLine;
let snapshot: SyncStatus = { state: 'Sincronizando...', pending: 0, lastSyncTime };

function publish() {
  snapshot = {
    state: !online ? 'Sem conexão' : failures.size ? 'Erro de sincronização'
      : operations.size || [...connections.values()].some(ready => !ready) || !lastSyncTime ? 'Sincronizando...' : 'Sincronizado',
    pending: operations.size, error: failures.values().next().value, lastSyncTime,
  };
  listeners.forEach(listener => listener(snapshot));
}
export function syncFailure(context: string, message: string) { failures.set(context, message); publish(); }
export function syncSuccess(context: string) { failures.delete(context); lastSyncTime = new Date().toISOString(); publish(); }
export function syncConnection(context: string, ready: boolean | null) {
  if (ready === null) { connections.delete(context); failures.delete(context); }
  else connections.set(context, ready);
  publish();
}
export function beginSync() { const id = Symbol(); operations.add(id); publish(); return () => { operations.delete(id); publish(); }; }
export function resetSyncStatus() { failures.clear(); connections.clear(); lastSyncTime = null; publish(); }
export function subscribeSyncStatus(callback: (status: SyncStatus) => void) {
  listeners.add(callback); callback(snapshot); return () => { listeners.delete(callback); };
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; publish(); });
  window.addEventListener('offline', () => { online = false; publish(); });
}
