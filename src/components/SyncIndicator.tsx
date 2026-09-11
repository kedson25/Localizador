import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { subscribeSyncStatus, type SyncEngineStatus } from '../lib/offlineQueue';

export const SyncIndicator = React.memo(function SyncIndicator({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const [status, setStatus] = useState<SyncEngineStatus>({
    isOnline: typeof navigator === 'undefined' || navigator.onLine,
    pendingCount: 0, syncingCount: 0, syncedCount: 0, statusLabel: 'sincronizado', lastSyncTime: null
  });
  useEffect(() => subscribeSyncStatus(setStatus), []);
  const failure = error || status.error;
  const label = failure ? 'Falha ao sincronizar · tentar novamente'
    : !status.isOnline ? `offline${status.pendingCount ? ` (${status.pendingCount} pendentes)` : ''}`
    : status.syncingCount ? `sincronizando ${status.syncingCount}`
    : status.pendingCount ? `${status.pendingCount} pendentes` : 'sincronizado';
  const Icon = failure ? AlertCircle : status.syncingCount ? Loader2 : status.pendingCount || !status.isOnline ? Clock : CheckCircle2;
  const colors = failure ? 'text-red-800 bg-red-50 border-red-200'
    : status.syncingCount ? 'text-blue-700 bg-blue-50 border-blue-200'
    : status.pendingCount || !status.isOnline ? 'text-amber-800 bg-amber-50 border-amber-200'
    : 'text-emerald-800 bg-emerald-50 border-emerald-200';
  return <button type="button" onClick={failure ? onRetry : undefined} title={failure || label}
    aria-live="polite" className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${colors}`}>
    <Icon className={`w-3.5 h-3.5 ${status.syncingCount ? 'animate-spin' : ''}`} />{label}
  </button>;
});
