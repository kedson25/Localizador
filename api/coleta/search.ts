import { adminDb } from '../_lib/firebase-admin';
import { SearchItemsSchema } from '../_lib/validation';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parseResult = SearchItemsSchema.safeParse(req.query || {});
    if (!parseResult.success) {
      return sendError(res, 400, 'INVALID_QUERY', 'Termo de busca e listaId são obrigatórios');
    }

    const { listaId, q, limit: maxResults } = parseResult.data;
    const cleanQuery = normalizeCodigo(q);
    const digitsQuery = cleanDigits(cleanQuery);

    const { db } = adminDb;
    const listaRef = db.collection('coleta_listas').doc(listaId);
    const itemsCol = listaRef.collection('itens');
    const resultsMap = new Map<string, any>();

    // 1. Busca Direta Determinística por Document ID (O(1))
    try {
      const deterministicId = getDeterministicItemId(cleanQuery);
      const docSnap = await itemsCol.doc(deterministicId).get();
      if (docSnap.exists) {
        resultsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
      }
    } catch (_) {}

    // 2. Busca exata por código no campo 'codigo'
    if (resultsMap.size < maxResults) {
      const exactSnap = await itemsCol
        .where('codigo', '==', cleanQuery)
        .limit(maxResults)
        .get();
      exactSnap.docs.forEach((d) => {
        resultsMap.set(d.id, { ...d.data(), id: d.id });
      });
    }

    // 3. Busca por dígitos limpos no campo 'codigoClean'
    if (digitsQuery && digitsQuery !== cleanQuery && resultsMap.size < maxResults) {
      const cleanSnap = await itemsCol
        .where('codigoClean', '==', digitsQuery)
        .limit(maxResults)
        .get();
      cleanSnap.docs.forEach((d) => {
        resultsMap.set(d.id, { ...d.data(), id: d.id });
      });
    }

    // 4. Busca por prefixo se ainda houver espaço
    if (resultsMap.size < maxResults && cleanQuery.length >= 3) {
      const prefixSnap = await itemsCol
        .where('codigo', '>=', cleanQuery)
        .where('codigo', '<=', cleanQuery + '\uf8ff')
        .limit(maxResults)
        .get();
      prefixSnap.docs.forEach((d) => {
        resultsMap.set(d.id, { ...d.data(), id: d.id });
      });
    }

    const items = Array.from(resultsMap.values());

    logApi('info', 'Busca global realizada', {
      endpoint: '/api/coleta/search',
      listaId,
      query: cleanQuery,
      found: items.length,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, { items });
  } catch (err: any) {
    return sendError(res, 500, 'SEARCH_FAILED', 'Erro ao pesquisar itens', err.message);
  }
}
