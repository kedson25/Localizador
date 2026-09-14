import crypto from 'crypto';

/**
 * Normaliza o código de um pacote:
 * - Converte para maiúsculas
 * - Remove espaços no início e fim
 * - Remove quebras de linha e caracteres não imprimíveis
 */
export function normalizeCodigo(codigo: string | undefined | null): string {
  if (!codigo) return '';
  return String(codigo)
    .trim()
    .toUpperCase()
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Extrai somente os dígitos do código (para compatibilidade com buscas numéricas).
 */
export function cleanDigits(val: string | undefined | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

/**
 * Gera um ID de documento determinístico para o pacote.
 * Utiliza o código normalizado para criar um identificador único e consistente.
 * Pacotes com o mesmo código normalizado SEMPRE terão o mesmo document ID.
 *
 * Estratégia:
 * 1. Para códigos curtos e sem caracteres especiais proibidos pelo Firestore (/),
 *    utiliza o próprio código com prefixo seguro.
 * 2. Adiciona um hash SHA-256 curto para garantir unicidade e validade como Document ID do Firestore.
 */
export function getDeterministicItemId(codigo: string): string {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) {
    throw new Error('Código do pacote não pode ser vazio para gerar ID determinístico');
  }

  // Gera hash SHA-256 determinístico a partir do código normalizado
  const hash = crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 24);

  // Sanitiza caracteres permitidos no Firestore ID (sem barras, sem espaços)
  const safePrefix = normalized
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 32);

  return `${safePrefix}_${hash}`;
}
