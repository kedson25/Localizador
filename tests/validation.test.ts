import { describe, it, expect } from 'vitest';
import {
  BipRequestSchema,
  UpdateItemSchema,
  DeleteItemSchema,
  BatchImportSchema,
  QueryItemsSchema,
  SaveListaMetaSchema,
} from '../api/_lib/validation';

describe('API Validation Schemas (Zod)', () => {
  it('deve validar um payload válido de bip', () => {
    const valid = {
      listaId: 'lista-123',
      codigo: 'PAC-999',
      saida: 'Ciclo 2 - Saída PM',
      motivo: 'Pendente',
      rota: 'Rota 14',
      responsavel: 'João',
    };

    const result = BipRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar bip sem código ou listaId', () => {
    expect(BipRequestSchema.safeParse({ listaId: '123' }).success).toBe(false);
    expect(BipRequestSchema.safeParse({ codigo: '123' }).success).toBe(false);
  });

  it('deve validar e rejeitar campos proibidos no UpdateItemSchema', () => {
    const valid = {
      listaId: 'lista-1',
      itemId: 'item-1',
      changes: { motivo: 'Refugo', validado: true },
    };
    expect(UpdateItemSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      listaId: 'lista-1',
      itemId: 'item-1',
      changes: { campoInvalidoMalicioso: 'hack' },
    };
    expect(UpdateItemSchema.safeParse(invalid).success).toBe(false);
  });

  it('deve validar lote com múltiplos itens no BatchImportSchema', () => {
    const batch = {
      listaId: 'lista-batch-1',
      items: [
        { codigo: 'PAC-1', rota: 'Rota 1' },
        { codigo: 'PAC-2', rota: 'Rota 2' },
      ],
      overwrite: false,
    };
    expect(BatchImportSchema.safeParse(batch).success).toBe(true);
  });

  it('deve rejeitar lote vazio', () => {
    const emptyBatch = {
      listaId: 'lista-batch-1',
      items: [],
    };
    expect(BatchImportSchema.safeParse(emptyBatch).success).toBe(false);
  });

  it('deve validar e limitar parâmetros de paginação', () => {
    const query = {
      listaId: 'lista-1',
      limit: '50',
      direction: 'next',
      order: 'desc',
    };
    const parsed = QueryItemsSchema.safeParse(query);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(50);
    }
  });

  it('deve validar metadados de criação de lista', () => {
    const lista = {
      nome: 'Lista de Teste PM',
      tipo: 'comum',
      rota: 'Brancas',
      saidaPadrao: 'Ciclo 2 - Saída PM',
    };
    expect(SaveListaMetaSchema.safeParse(lista).success).toBe(true);
  });
});
