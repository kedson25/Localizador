import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.dirname(testDirectory);
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
  throw new Error('Run npm run test:emulator. This suite refuses to contact production.');
}

class Session {
  constructor(filename, name) {
    this.name = name;
    this.worker = new Worker(filename, { workerData: { name } });
    this.requests = new Map();
    this.waiters = new Set();
    this.sequence = 0;
    this.counts = {};
    this.ready = false;
    this.worker.on('message', message => {
      if (message.event === 'ready') this.ready = true;
      if (message.event === 'snapshot') this.counts = message.counts;
      if (message.event === 'status') this.status = message.status;
      if (message.request) {
        const pending = this.requests.get(message.request);
        if (pending) {
          this.requests.delete(message.request);
          clearTimeout(pending.timer);
          message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result);
        }
      }
      for (const notify of this.waiters) notify();
    });
    this.worker.on('error', error => {
      this.error = error;
      for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.requests.clear();
      for (const notify of this.waiters) notify();
    });
  }
  request(command, args = {}, timeout = 90000) {
    return new Promise((resolve, reject) => {
      const request = ++this.sequence;
      const timer = setTimeout(() => {
        this.requests.delete(request);
        reject(new Error(`${this.name}: ${command} timed out`));
      }, timeout);
      this.requests.set(request, { resolve, reject, timer });
      this.worker.postMessage({ request, command, args });
    });
  }
  wait(predicate, description, timeout = 90000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`${this.name}: ${description}; counts=${JSON.stringify(this.counts)}; status=${JSON.stringify(this.status)}`)), timeout);
      const finish = error => { clearTimeout(timer); this.waiters.delete(check); error ? reject(error) : resolve(); };
      const check = () => { if (this.error) finish(this.error); else if (predicate(this)) finish(); };
      this.waiters.add(check);
      check();
    });
  }
  async close() {
    try { await this.request('close', {}, 3000); } catch { /* Terminate still guarantees cleanup after a failure. */ }
    await this.worker.terminate();
    for (const pending of this.requests.values()) clearTimeout(pending.timer);
  }
}

test('Firestore: rapid scans, three concurrent computers, offline recovery and atomic conflicts', { timeout: 360000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'localizador-emulator-tests-'));
  const workerFile = path.join(directory, 'session.cjs');
  const clientSource = await readFile(path.join(testDirectory, 'emulatorClient.ts'), 'utf8');
  await build({
    entryPoints: [path.join(testDirectory, 'emulatorSession.ts')], outfile: workerFile,
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent',
    plugins: [{ name: 'local-emulator-only', setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)firebase$/ }, args => {
        if (args.path.startsWith('.')) return { path: 'emulator-client', namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: clientSource, loader: 'ts', resolveDir: testDirectory }));
    } }],
  });
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/demo-localizador/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true, 'test emulator resets successfully');
  const sessions = ['operator-A', 'operator-B', 'operator-C'].map(name => new Session(workerFile, name));
  t.after(async () => { await Promise.allSettled(sessions.map(session => session.close())); await rm(directory, { recursive: true, force: true }); });
  await Promise.all(sessions.map(session => session.wait(state => state.ready, 'worker ready')));

  const counts = (id, size) => Promise.all(sessions.map(session => session.wait(state => state.counts[id] === size, `${id} should contain ${size} IDs`)));
  const drained = () => Promise.all(sessions.map(session => session.wait(state => state.status?.pendingCount === 0 && state.status?.syncingCount === 0, 'durable queue should drain')));
  const create = async id => { assert.equal(await sessions[0].request('create', { id }), true); await counts(id, 0); await drained(); };
  const assertConvergence = async (id, codes) => {
    await counts(id, codes.length);
    await drained();
    const snapshots = await Promise.all(sessions.map(session => session.request('inspect', { id })));
    for (const snapshot of snapshots) {
      assert.equal(snapshot.count, codes.length);
      assert.equal(snapshot.uniqueIds, codes.length);
      assert.equal(snapshot.uniqueCodes, codes.length);
      assert.deepEqual(snapshot.codes.sort(), [...codes].sort());
    }
    assert.equal(new Set(snapshots.map(snapshot => snapshot.digest)).size, 1, 'all item fields converge across computers');
    return snapshots;
  };

  for (const amount of [100, 1000]) {
    await t.test(`${amount} rapid scans are durable before Firebase acknowledgements`, async subtest => {
      const id = `rapid-${amount}`;
      await create(id);
      const codes = Array.from({ length: amount }, (_, index) => String(amount * 10000 + index));
      // Disconnect the writer first: successful acceptance now proves that the
      // input path does not wait for a server acknowledgement.
      await sessions[0].request('offline');
      const report = await sessions[0].request('scan', { id, codes });
      assert.equal(report.accepted, amount);
      assert.ok(report.p95Ms < 50, `synchronous scan p95 ${report.p95Ms} ms exceeds an input frame budget`);
      assert.ok(report.lastQuarterMeanMs < Math.max(10, report.firstQuarterMeanMs * 8), 'scan dispatch must not degrade with queue depth');
      subtest.diagnostic(JSON.stringify(report));
      await sessions[0].request('online');
      await assertConvergence(id, codes);
    });
  }

  await t.test('three simultaneous sessions each scan 1000 IDs, including 100 shared IDs', async subtest => {
    const id = 'three-sessions';
    await create(id);
    const shared = Array.from({ length: 100 }, (_, index) => String(900000 + index));
    const inputs = sessions.map((_, session) => [...shared, ...Array.from({ length: 900 }, (_, index) => String(10000000 + session * 10000 + index))]);
    const results = await Promise.all(sessions.map((session, index) => session.request('scan', { id, codes: inputs[index] })));
    for (const result of results) assert.equal(result.accepted, 1000);
    subtest.diagnostic(JSON.stringify(results));
    await assertConvergence(id, [...new Set(inputs.flat())]);
  });

  await t.test('disjoint concurrent metadata edits and scans preserve each other', async () => {
    const id = 'concurrent-edits';
    await create(id);
    const results = await Promise.all([
      sessions[0].request('update', { id, patch: { nome: 'Nome atualizado' } }),
      sessions[1].request('update', { id, patch: { responsavel: 'Outro operador' } }),
      sessions[2].request('scan', { id, codes: ['555001', '555002'] }),
    ]);
    assert.ok(results.every(result => result === true || result.accepted === 2));
    const snapshots = await assertConvergence(id, ['555001', '555002']);
    for (const snapshot of snapshots) { assert.equal(snapshot.nome, 'Nome atualizado'); assert.equal(snapshot.responsavel, 'Outro operador'); }
  });

  await t.test('deletion reaches every session without stale cached resurrection', async () => {
    const id = 'concurrent-edits';
    assert.equal(await sessions[1].request('remove', { id, ids: ['555001'] }), true);
    await assertConvergence(id, ['555002']);
    assert.equal(await sessions[0].request('delete', { id }), true);
    await Promise.all(sessions.map(session => session.wait(state => !(id in state.counts), 'deleted list disappears')));
    await drained();
    for (const session of sessions) assert.equal(await session.request('inspect', { id }), null);
  });
});
