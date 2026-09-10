import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { ColetaItem } from '../src/types';
import {
  enqueueBipLocally, enqueueBatchBipsLocally, getPendingEntries,
  getOutboxMetrics, markEntriesStatus, processOutboxSync, removePendingItems,
  setAdditionalSyncStatus, startOutboxSync
} from '../src/lib/offlineQueue';

let online = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });

const item = (id: string, codigo = id): ColetaItem => ({
  id, codigo, rota: 'R1', saida: '', motivo: '', scannedAt: '2026-09-10T12:00:00.000Z'
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

async function waitFor(predicate: () => Promise<boolean>, description: string) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(5);
  }
  assert.fail(description);
}

beforeEach(async () => {
  online = true;
  setAdditionalSyncStatus({ pendingCount: 0, syncingCount: 0 });
  // A successful write also resets a previous storage-error status.
  await enqueueBipLocally('test-reset', item('reset'));
  for (const id of new Set((await getPendingEntries()).map(entry => entry.listaId))) await removePendingItems(id);
});

test('enqueue and status changes only report success after their transactions commit', async t => {
  assert.equal(await enqueueBipLocally('list-a', item('one')), true);
  const originalPut = IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
    const request = originalPut.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  });
  t.mock.method(console, 'error', () => {});
  assert.equal(await enqueueBipLocally('list-a', item('two')), false);
  await assert.rejects(markEntriesStatus(['list-a_one'], 'sincronizando'));
  const pending = await getPendingEntries('list-a');
  assert.deepEqual(pending.map(entry => entry.itemId), ['one']);
  assert.equal(pending[0].syncStatus, 'pendente');
  assert.match((await getOutboxMetrics()).error || '', /armazenamento local/i);
});

test('a replacement scan survives acknowledgement of the previous upload', async () => {
  await enqueueBipLocally('list-a', item('one', 'old-code'));
  const started = deferred<void>();
  const upload = deferred<boolean>();
  const acknowledged: string[][] = [];
  const processing = processOutboxSync(async (_listaId, items) => {
    assert.equal(items[0].codigo, 'old-code');
    started.resolve();
    return upload.promise;
  }, (_listaId, ids) => acknowledged.push(ids));
  await started.promise;
  await enqueueBipLocally('list-a', item('one', 'new-code'));
  upload.resolve(true);
  await processing;
  const pending = await getPendingEntries('list-a');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].item.codigo, 'new-code');
  assert.equal(pending[0].syncStatus, 'pendente');
  assert.deepEqual(acknowledged, []);
  await processOutboxSync(async (_listaId, items) => {
    assert.equal(items[0].codigo, 'new-code');
    return true;
  }, (_listaId, ids) => acknowledged.push(ids));
  assert.deepEqual(await getPendingEntries(), []);
  assert.deepEqual(acknowledged, [['one']]);
});

test('a failed upload stays durable and returns without sleeping through backoff', async () => {
  await enqueueBatchBipsLocally('list-a', [item('one'), item('two')]);
  const startedAt = Date.now();
  await processOutboxSync(async () => false);
  assert.ok(Date.now() - startedAt < 750, 'retry backoff must not block the processing promise');
  const pending = await getPendingEntries('list-a');
  assert.equal(pending.length, 2);
  assert.ok(pending.every(entry => entry.syncStatus === 'pendente' && entry.retryCount === 1 && entry.lastError));
  assert.match((await getOutboxMetrics()).error || '', /sincronizar/i);
  await processOutboxSync(async () => true);
});

test('database read failures reject and retain the last known queue count', async t => {
  await enqueueBipLocally('list-a', item('one'));
  assert.equal((await getOutboxMetrics()).pendingCount, 1);
  t.mock.method(IDBDatabase.prototype, 'transaction', () => { throw new Error('database unavailable'); });
  await assert.rejects(getPendingEntries(), /database unavailable/);
  const metrics = await getOutboxMetrics();
  assert.equal(metrics.pendingCount, 1);
  assert.match(metrics.statusLabel, /database unavailable/);
  assert.notEqual(metrics.statusLabel, 'sincronizado');
});

test('starting the global runner recovers entries left syncing by a closed page', async t => {
  await enqueueBipLocally('list-a', item('one'));
  await markEntriesStatus(['list-a_one'], 'sincronizando');
  let uploaded = 0;
  t.after(startOutboxSync(async () => { uploaded++; return true; }));
  await waitFor(async () => uploaded === 1 && (await getPendingEntries()).length === 0, 'startup should recover the durable outbox');
});

test('a committed enqueue wakes the idle runner immediately', async t => {
  let uploaded = 0;
  t.after(startOutboxSync(async () => { uploaded++; return true; }));
  await delay(30);
  assert.equal(uploaded, 0);
  await enqueueBipLocally('list-a', item('one'));
  await waitFor(async () => uploaded === 1 && (await getPendingEntries()).length === 0, 'enqueue should sync without a polling interval');
});

test('enqueue during an upload schedules the next pass without losing its wake-up', async t => {
  const started = deferred<void>();
  const upload = deferred<boolean>();
  const codes: string[] = [];
  await enqueueBipLocally('list-a', item('one', 'first'));
  t.after(startOutboxSync(async (_listaId, items) => {
    codes.push(...items.map(entry => entry.codigo));
    if (codes.length === 1) { started.resolve(); return upload.promise; }
    return true;
  }));
  await started.promise;
  await enqueueBipLocally('list-a', item('one', 'second'));
  upload.resolve(true);
  await waitFor(async () => codes.length === 2 && (await getPendingEntries()).length === 0, 'changes made during upload should trigger another pass');
  assert.deepEqual(codes, ['first', 'second']);
});

test('reconnection uploads offline entries and removal waits for an in-flight upload', async t => {
  online = false;
  const started = deferred<void>();
  const upload = deferred<boolean>();
  let calls = 0;
  t.after(startOutboxSync(async () => { calls++; started.resolve(); return upload.promise; }));
  await enqueueBipLocally('list-a', item('one'));
  await delay(30);
  assert.equal(calls, 0);
  online = true;
  window.dispatchEvent(new Event('online'));
  await started.promise;
  let removed = false;
  const removal = removePendingItems('list-a').then(() => { removed = true; });
  await delay(20);
  assert.equal(removed, false, 'remote deletion must wait for an older upload');
  assert.deepEqual(await getPendingEntries('list-a'), []);
  upload.resolve(true);
  await removal;
  assert.equal(removed, true);
});

test('new journal metrics are included and report its storage errors', async () => {
  await enqueueBipLocally('list-a', item('one'));
  setAdditionalSyncStatus({ pendingCount: 3, syncingCount: 2, lastError: 'Falha no journal', lastSyncTime: '12:34:56' });
  const metrics = await getOutboxMetrics();
  assert.equal(metrics.pendingCount, 4);
  assert.equal(metrics.syncingCount, 2);
  assert.equal(metrics.error, 'Falha no journal');
  assert.equal(metrics.lastSyncTime, '12:34:56');
});
