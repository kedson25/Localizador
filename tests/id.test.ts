import { describe, it, expect } from 'vitest';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../api/_lib/id';

describe('normalizeCodigo e cleanDigits', () => {
  it('deve normalizar códigos removendo espaços e convertendo para maiúsculas', () => {
    expect(normalizeCodigo('  abc-123  ')).toBe('ABC-123');
    expect(normalizeCodigo('pkg_xyz\n\t')).toBe('PKG_XYZ');
    expect(normalizeCodigo('  MELI 987 654 ')).toBe('MELI 987 654');
  });

  it('deve extrair somente dígitos', () => {
    expect(cleanDigits('ABC-123-456')).toBe('123456');
    expect(cleanDigits('   ')).toBe('');
  });

  it('deve gerar IDs determinísticos idênticos para o mesmo código', () => {
    const id1 = getDeterministicItemId('PAC-001');
    const id2 = getDeterministicItemId(' pac-001 ');
    const id3 = getDeterministicItemId('PAC-001\n');

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('deve gerar IDs diferentes para códigos diferentes', () => {
    const id1 = getDeterministicItemId('PAC-001');
    const id2 = getDeterministicItemId('PAC-002');

    expect(id1).not.toBe(id2);
  });

  it('deve gerar IDs seguros para o Firestore (sem barras ou caracteres inválidos)', () => {
    const id = getDeterministicItemId('BR/SP/123-456#XPTO');
    expect(id).not.toContain('/');
    expect(id).not.toContain(' ');
    expect(id.length).toBeGreaterThan(10);
  });
});
