import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';
import { syncConnection, syncFailure, syncSuccess } from './syncStatus';

type Change = { table: string; new: Record<string, unknown>; old: Record<string, unknown>; eventType: string };
type WatchTable = { table: string; filter?: string };
type Subscriber<T> = { next: (data: T) => void; error?: (error: Error) => void };
export interface LiveQuery<T> {
  subscribe: (next: (data: T) => void, error?: (error: Error) => void) => () => void;
  refresh: (id?: string) => void;
  current: () => T | undefined;
}

// One shared channel per context. Changes are coalesced, refreshes serialized,
// and a reconnect always reads a fresh server snapshot before publishing success.
export function createLiveQuery<T>(context: string, tables: WatchTable[],
  load: (changed: Set<string> | null, previous: T | undefined) => Promise<T>,
  changeKey?: (change: Change) => string | undefined): LiveQuery<T> {
  const subscribers = new Set<Subscriber<T>>();
  let channel: RealtimeChannel | undefined;
  let value: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  let fallbackTimer: ReturnType<typeof setInterval> | undefined;
  let dirty = new Set<string>();
  let full = true;
  let working = false;
  let connected = false;
  let epoch = 0;

  const fail = (cause: unknown) => {
    const error = toDataError(cause);
    if (error.kind === 'auth' || error.kind === 'permission') value = undefined;
    syncFailure(context, error.message);
    subscribers.forEach(subscriber => subscriber.error?.(error));
  };
  const refresh = (id?: string) => {
    if (id) dirty.add(id); else full = true;
    if (!subscribers.size || working || timer || !connected) return;
    timer = setTimeout(() => { timer = undefined; void reload(); }, 60);
  };
  const reload = async () => {
    if (working || !connected || !subscribers.size) return;
    working = true;
    const generation = epoch;
    const changed = full ? null : new Set(dirty);
    dirty.clear(); full = false;
    try {
      const next = await load(changed, value);
      if (generation !== epoch || !connected || !subscribers.size) return;
      value = next;
      syncSuccess(context);
      syncConnection(context, true);
      subscribers.forEach(subscriber => subscriber.next(next));
    } catch (error) { if (generation === epoch) fail(error); }
    finally {
      working = false;
      if (full || dirty.size) refresh(dirty.values().next().value);
    }
  };
  const onOffline = () => {
    connected = false; full = true;
    syncConnection(context, false);
    fail(new DataError('network', 'Sem conexão. Os dados precisam ser consultados novamente no servidor.'));
  };
  const onOnline = () => {
    if (channel?.state === 'joined') { connected = true; refresh(); }
    else if (subscribers.size) activateHttpFallback();
  };
  const activateHttpFallback = () => {
    if (fallbackTimer || !subscribers.size) return;
    // Corporate networks often block WebSocket while allowing HTTPS REST calls.
    connected = true;
    syncConnection(context, true);
    refresh();
    fallbackTimer = setInterval(() => { if (connected) refresh(); }, 5000);
  };
  const start = async () => {
    const generation = ++epoch;
    syncConnection(context, false);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new DataError('auth', 'Entre com sua conta para carregar os dados.');
      await supabase.realtime.setAuth(data.session.access_token);
      if (generation !== epoch || !subscribers.size) return;
      channel = supabase.channel(`${context}:${crypto.randomUUID()}`);
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', ...table }, payload => {
          refresh(changeKey?.(payload as unknown as Change));
        });
      }
      channel.subscribe(status => {
        if (generation !== epoch) return;
        if (status === 'SUBSCRIBED') {
          if (fallbackTimer) clearInterval(fallbackTimer);
          fallbackTimer = undefined;
          connected = true;
          refresh();
        }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          activateHttpFallback();
        }
      });
      // Reconcile missed events as well as RLS changes. HTTPS fallback keeps
      // synchronization working when a corporate firewall blocks WebSocket.
      healthTimer = setInterval(() => { if (connected) refresh(); }, 60000);
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
    } catch (error) {
      if (generation === epoch && error instanceof DataError && error.kind === 'auth') fail(error);
      else if (generation === epoch) activateHttpFallback();
    }
  };
  const stop = () => {
    epoch++; connected = false; value = undefined; full = true; dirty.clear();
    if (timer) clearTimeout(timer); timer = undefined;
    if (healthTimer) clearInterval(healthTimer); healthTimer = undefined;
    if (fallbackTimer) clearInterval(fallbackTimer); fallbackTimer = undefined;
    if (channel) void supabase.removeChannel(channel); channel = undefined;
    window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline);
    syncConnection(context, null);
  };
  return {
    subscribe(next, error) {
      const subscriber = { next, error }; subscribers.add(subscriber);
      if (value !== undefined) next(value);
      if (subscribers.size === 1) void start();
      return () => { subscribers.delete(subscriber); if (!subscribers.size) stop(); };
    }, refresh, current: () => value,
  };
}
