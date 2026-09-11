import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColetaItem } from '../types';
import { clearIndividualSession, loadIndividualSession, listenToIndividualSession, saveIndividualItems } from '../lib/individualSession';

/** Individual work is private to the operator and persisted in Supabase. */
export function useIndividualDraft(session: string | null, onError: (message: string) => void) {
  const [items, publish] = useState<ColetaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const records = useRef<ColetaItem[]>([]);
  const sessionRef = useRef(session);
  const pending = useRef(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const fail = useCallback((error: unknown) => {
    errorRef.current(error instanceof Error ? error.message : 'Não foi possível salvar a sessão individual no servidor. Tente novamente.');
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    records.current = [];
    publish([]);
    setReady(false);
    if (!session) return;
    return listenToIndividualSession(session, saved => {
      records.current = saved;
      publish(saved);
      setReady(true);
    }, error => {
      records.current = [];
      publish([]);
      setReady(false);
      fail(error);
    });
  }, [session, fail]);

  const setItems = useCallback(async (action: ColetaItem[] | ((previous: ColetaItem[]) => ColetaItem[])): Promise<boolean> => {
    const key = sessionRef.current;
    if (!key || !ready || pending.current) return false;
    const previous = records.current;
    const next = typeof action === 'function' ? action(previous) : action;
    const before = new Map(previous.map(item => [item.id, item]));
    const nextIds = new Set(next.map(item => item.id));
    const changed = next.filter(item => before.get(item.id) !== item);
    const removed = previous.filter(item => !nextIds.has(item.id)).map(item => item.id);
    pending.current = true;
    setSaving(true);
    try {
      if (changed.length || removed.length) await saveIndividualItems(key, changed, removed);
      const saved = await loadIndividualSession(key);
      if (sessionRef.current === key) {
        records.current = saved;
        publish(saved);
      }
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [ready, fail]);

  const discard = useCallback(async (): Promise<boolean> => {
    const key = sessionRef.current;
    if (!key || pending.current) return false;
    pending.current = true;
    setSaving(true);
    try {
      await clearIndividualSession(key);
      if (sessionRef.current === key) {
        records.current = [];
        publish([]);
      }
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [fail]);

  return { items, setItems, discard, ready, saving };
}
