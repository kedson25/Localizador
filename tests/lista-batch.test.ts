import assert from 'node:assert/strict';
import test from 'node:test';
import { LISTA_ITEMS_BATCH_SIZE, splitListaItemsIntoBatches } from '../src/lib/listaPersistence';

test('150 imported IDs are split into three complete database writes', () => {
  const ids = Array.from({ length: 150 }, (_, index) => `id-${index + 1}`);
  const batches = splitListaItemsIntoBatches(ids);

  assert.equal(LISTA_ITEMS_BATCH_SIZE, 50);
  assert.deepEqual(batches.map(batch => batch.length), [50, 50, 50]);
  assert.deepEqual(batches.flat(), ids);
});

test('the final batch keeps every remaining ID without padding', () => {
  const ids = Array.from({ length: 127 }, (_, index) => index);
  const batches = splitListaItemsIntoBatches(ids);

  assert.deepEqual(batches.map(batch => batch.length), [50, 50, 27]);
  assert.deepEqual(batches.flat(), ids);
});

test('an invalid batch size fails before any write starts', () => {
  assert.throws(() => splitListaItemsIntoBatches(['id'], 0), RangeError);
});
