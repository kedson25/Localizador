import assert from 'node:assert/strict';
import test from 'node:test';
import { compareListasNewestFirst } from '../src/lib/listaOrder';
import type { ColetaLista } from '../src/types';

function lista(id: string, data: string, createdAt?: string): ColetaLista {
  return {
    id,
    data,
    created_at: createdAt,
    nome: id,
    rota: 'Geral',
    responsavel: 'Teste',
    status: 'em_andamento',
    saidaPadrao: '',
    motivoPadrao: '',
    itens: [],
  };
}

test('listas use the database creation instant before display date or cycle', () => {
  const older = lista('lista-older', '31/12/2030', '2026-09-11T10:00:00Z');
  const newer = lista('lista-newer', '01/01/2020', '2026-09-12T10:00:00Z');
  assert.deepEqual([older, newer].sort(compareListasNewestFirst).map(item => item.id), ['lista-newer', 'lista-older']);
});

test('legacy lists fall back to their timestamp id and then their date', () => {
  const byDate = lista('legacy', '10/09/2026');
  const byOlderId = lista('lista-1788954211489', '01/01/2000');
  const byNewerId = lista('lista-1789048533419', '01/01/2000');
  assert.deepEqual([byDate, byOlderId, byNewerId].sort(compareListasNewestFirst).map(item => item.id),
    ['lista-1789048533419', 'legacy', 'lista-1788954211489']);
});
