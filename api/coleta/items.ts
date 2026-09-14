import { adminDb } from '../_lib/firebase-admin';
import { QueryItemsSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parseResult = QueryItemsSchema.safeParse(req.query || {});
    if (!parseResult.success) {
      return sendError(res, 400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos', parseResult.error.format());
    }

    const { listaId, limit: pageSize, cursor, direction, saida, motivo, validado, order } = parseResult.data;
    const { db } = adminDb;

    // 1. Obter contadores e metadados da lista pai (O(1))
    const listaRef = db.collection('coleta_listas').doc(listaId);
    const listaSnap = await listaRef.get();
    if (!listaSnap.exists) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
    }

    const listaData = listaSnap.data() || {};
    const totalItens = typeof listaData.totalItens === 'number' ? listaData.totalItens : 0;

    // 2. Construir query paginada na subcoleção itens
    let q: any = listaRef.collection('itens');

    if (saida) {
      q = q.where('saida', '==', saida);
    }
    if (motivo) {
      q = q.where('motivo', '==', motivo);
    }
    if (validado !== undefined) {
      q = q.where('validado', '==', validado === 'true');
    }

    q = q.orderBy('timestamp', order);

    if (cursor) {
      // Obter documento cursor para paginação estável
      const cursorDoc = await listaRef.collection('itens').doc(cursor).get();
      if (cursorDoc.exists) {
        if (direction === 'next') {
          q = q.startAfter(cursorDoc);
        } else {
          q = q.endBefore(cursorDoc);
        }
      }
    }

    // Busca pageSize + 1 para saber se há mais registros
    q = q.limit(pageSize + 1);

    const snapshot = await q.get();
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pagedDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const items = pagedDocs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    }));

    const nextCursor = items.length > 0 ? items[items.length - 1].id : null;
    const prevCursor = items.length > 0 ? items[0].id : null;

    logApi('info', 'Página de itens carregada', {
      endpoint: '/api/coleta/items',
      listaId,
      itemsCount: items.length,
      totalItens,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, {
      items,
      nextCursor: hasMore ? nextCursor : null,
      prevCursor,
      hasMore,
      total: totalItens,
      pageSize,
    });
  } catch (err: any) {
    return sendError(res, 500, 'PAGINATION_FAILED', 'Erro ao carregar página de itens', err.message);
  }
}
