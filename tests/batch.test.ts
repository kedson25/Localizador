import { describe, it, expect } from 'vitest';
import { normalizeCodigo, getDeterministicItemId } from '../api/_lib/id';

describe('Batch Processing Logic', () => {
  it('deve deduplicar códigos repetidos dentro do mesmo lote', () => {
    const rawItems = [
      { codigo: 'PAC-100', rota: 'Rota A' },
      { codigo: ' pac-100 ', rota: 'Rota A2' },
      { codigo: 'PAC-200', rota: 'Rota B' },
      { codigo: 'pac-200\n', rota: 'Rota B2' },
      { codigo: 'PAC-300', rota: 'Rota C' },
    ];

    const uniqueMap = new Map<string, any>();
    let duplicates = 0;

    for (const item of rawItems) {
      const norm = normalizeCodigo(item.codigo);
      if (uniqueMap.has(norm)) {
        duplicates++;
      } else {
        uniqueMap.set(norm, item);
      }
    }

    expect(duplicates).toBe(2);
    expect(uniqueMap.size).toBe(3);
    expect(uniqueMap.has('PAC-100')).toBe(true);
    expect(uniqueMap.has('PAC-200')).toBe(true);
    expect(uniqueMap.has('PAC-300')).toBe(true);
  });

  it('deve particionar lotes grandes em chunks seguros de 400', () => {
    const CHUNK_SIZE = 400;
    const totalItems = 1250;
    const mockList = Array.from({ length: totalItems }, (_, i) => ({
      codigo: `CODE-${i}`,
    }));

    const chunks = [];
    for (let i = 0; i < mockList.length; i += CHUNK_SIZE) {
      chunks.push(mockList.slice(i, i + CHUNK_SIZE));
    }

    expect(chunks.length).toBe(4);
    expect(chunks[0].length).toBe(400);
    expect(chunks[1].length).toBe(400);
    expect(chunks[2].length).toBe(400);
    expect(chunks[3].length).toBe(50);
  });
});
