import { adminDb } from '../_lib/firebase-admin';
import { sendSuccess, sendError } from '../_lib/response';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  const { listaId } = req.query || {};
  if (!listaId) {
    return sendError(res, 400, 'MISSING_LISTA_ID', 'listaId é obrigatório');
  }

  try {
    const { db } = adminDb;
    const docSnap = await db.collection('coleta_listas').doc(listaId).get();

    if (!docSnap.exists) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista não encontrada');
    }

    const data = docSnap.data() || {};
    const stats = {
      listaId,
      nome: data.nome,
      status: data.status,
      totalItens: typeof data.totalItens === 'number' ? data.totalItens : 0,
      totalValidados: typeof data.totalValidados === 'number' ? data.totalValidados : 0,
      saidasCount: data.saidasCount || {},
      motivosCount: data.motivosCount || {},
      bipsPorOperador: data.bipsPorOperador || {},
      updatedAt: data.updatedAt,
    };

    return sendSuccess(res, stats);
  } catch (err: any) {
    return sendError(res, 500, 'STATS_FAILED', 'Erro ao obter estatísticas da lista', err.message);
  }
}
