import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColetaItem } from '../types';
import { clearIndividualSession, loadIndividualSession, saveIndividualItems } from '../lib/individualSession';

export function useIndividualDraft(session: string | null, onError: (message: string) => void) {
  const [items, publish] = useState<ColetaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const records = useRef(new Map<string, ColetaItem>());
  const codes = useRef(new Map<string, ColetaItem>());
  const codeKey = (value: string) => value.replace(/\D/g, '') || value.trim().toUpperCase().replace(/M$/, '');
  const keyRef = useRef(session);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const getItems = useCallback(() => Array.from(records.current.values()).reverse(), []);
  const publishSoon = useCallback(() => {
    if (timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      publish(getItems());
    }, 50);
  }, [getItems]);
  const fail = useCallback((error: unknown) => {
    console.error('Falha ao guardar sessão individual:', error);
    errorRef.current('A sessão individual ainda não foi salva. Mantenha esta tela aberta e tente salvar novamente.');
  }, []);

  useEffect(() => {
    keyRef.current = session;
    records.current = new Map();
    codes.current = new Map();
    publish([]);
    setReady(false);
    setRestored(false);
    let alive = true;
    if (session) void loadIndividualSession(session).then(saved => {
      if (!alive) return;
      records.current = new Map([...saved].reverse().map(item => [item.id, item]));
      codes.current = new Map(saved.map(item => [codeKey(item.codigo), item]));
      publish(saved);
      setRestored(saved.length > 0);
      setReady(true);
    }).catch(error => { if (alive) { fail(error); setReady(true); } });
    else setReady(true);
    return () => { alive = false; clearTimeout(timer.current); timer.current = undefined; };
  }, [session, fail]);

  const upsert = useCallback((item: ColetaItem) => {
    const key = keyRef.current;
    if (!key) return;
    records.current.set(item.id, item);
    codes.current.set(codeKey(item.codigo), item);
    publishSoon();
    void saveIndividualItems(key, [item]).catch(fail);
  }, [fail, publishSoon]);

  const setItems = useCallback((action: ColetaItem[] | ((previous: ColetaItem[]) => ColetaItem[])) => {
    const key = keyRef.current;
    if (!key) return;
    const previous = records.current;
    const next = typeof action === 'function' ? action(getItems()) : action;
    const nextMap = new Map([...next].reverse().map(item => [item.id, item]));
    const changed = next.filter(item => previous.get(item.id) !== item);
    const removed = [...previous.keys()].filter(id => !nextMap.has(id));
    records.current = nextMap;
    codes.current = new Map(next.map(item => [codeKey(item.codigo), item]));
    publish(next);
    if (changed.length || removed.length) void saveIndividualItems(key, changed, removed).catch(fail);
  }, [fail, getItems]);

  const discard = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return true;
    try {
      await clearIndividualSession(key);
      if (keyRef.current === key) {
        records.current.clear();
        codes.current.clear();
        publish([]);
        setRestored(false);
      }
      return true;
    } catch (error) { fail(error); return false; }
  }, [fail]);

  const retry = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    await saveIndividualItems(key, getItems());
  }, [getItems]);

  return { items, setItems, upsert, discard, retry, ready, restored, getItems, codes };
}
