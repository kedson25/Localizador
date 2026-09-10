import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Bundle the production merge function without mounting UI or initializing Firebase.
const { outputFiles } = await build({
  stdin: {
    contents: 'export { mergeIndividualItems } from "./ListasColeta.tsx";',
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'transform',
  tsconfigRaw: { compilerOptions: { jsx: 'react' } },
  plugins: [{
    name: 'isolate-merge',
    setup(builder) {
      builder.onResolve({ filter: /^(react|papaparse|lucide-react|motion\/|\.\.\/lib\/)/ }, args => ({
        path: args.path,
        external: true,
        sideEffects: false
      }));
    }
  }]
});
const { mergeIndividualItems } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

const item = (codigo, overrides = {}) => ({
  id: `original-${codigo}`,
  codigo,
  rota: 'Rota A',
  saida: 'PM',
  motivo: 'Pendente',
  scannedAt: '10/09/2026 10:00:00',
  validado: false,
  ...overrides
});

test('unifying new IDs before existing ones preserves every original ID and updates the correct item', () => {
  const current = [item('471'), item('472')];
  const original = structuredClone(current);
  const session = [item('473'), item('472', { id: 'session-472', validado: true }), item('471', { validado: true })];
  const result = mergeIndividualItems(current, session, 'Operador B');

  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map(entry => entry.codigo), ['473', '471', '472']);
  assert.equal(result.items.find(entry => entry.codigo === '472').id, 'original-472');
  assert.equal(result.items.find(entry => entry.codigo === '471').validado, true);
  assert.equal(result.items.find(entry => entry.codigo === '472').validado, true);
  assert.equal(result.addedCount, 1);
  assert.equal(result.updatedCount, 2);
  assert.deepEqual(current, original);
});

test('repeated scanner variants retain one record with its existing document ID', () => {
  const result = mergeIndividualItems([item('47123')], [
    item('47123m', { id: 'temporary-1' }),
    item(' 47123 ', { id: 'temporary-2', validado: true })
  ], 'Coletor');

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'original-47123');
  assert.equal(result.items[0].validado, true);
  assert.equal(result.items[0].syncStatus, 'pendente');
});

test('merging a large session retains all unrelated IDs and their routes', () => {
  const current = Array.from({ length: 5000 }, (_, index) => item(String(470000 + index)));
  const session = [item('480000'), ...current.filter((_, index) => index % 5 === 0).map(entry => ({ ...entry, validado: true, rota: 'Sem Rota' }))];
  const result = mergeIndividualItems(current, session, 'Coletor');

  assert.equal(result.items.length, 5001);
  assert.equal(new Set(result.items.map(entry => entry.id)).size, 5001);
  assert.equal(result.items.filter(entry => entry.validado).length, 1000);
  assert.equal(result.items.find(entry => entry.codigo === '470005').rota, 'Rota A');
  assert.equal(result.items.find(entry => entry.codigo === '470001').responsavel, undefined);
});

test('an empty session leaves the main list intact', () => {
  const current = [item('471')];
  const result = mergeIndividualItems(current, [], 'Coletor');
  assert.deepEqual(result.items, current);
  assert.equal(result.addedCount, 0);
  assert.equal(result.updatedCount, 0);
});
