import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { subscribeSyncStatus, type SyncStatus } from '../services/syncStatus';

export function SyncIndicator({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'Sincronizando...', pending: 0, lastSyncTime: null });
  useEffect(() => subscribeSyncStatus(setStatus), []);
  const failure = error || status.error;
  const label = status.state === 'Sem conexão' ? status.state : failure ? 'Erro de sincronização' : status.state;
  if (!failure && label === 'Sincronizando...') return null;
  const Icon = label === 'Sem conexão' ? CloudOff : failure ? AlertCircle : label === 'Sincronizando...' ? Loader2 : CheckCircle2;
  const colors = failure ? 'text-red-800 bg-red-50 border-red-200' : label === 'Sincronizado' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-amber-800 bg-amber-50 border-amber-200';
  return <button type="button" onClick={onRetry} title={failure || label} aria-live="polite"
    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${colors}`}>
    <Icon className={`w-3.5 h-3.5 ${label === 'Sincronizando...' ? 'animate-spin' : ''}`} />{label}
  </button>;
}
