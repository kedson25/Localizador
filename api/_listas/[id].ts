import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const { db } = adminDb;

  // Extrair ID tanto de req.query quanto da URL
  const listaId =
    req.query?.id ||
    req.query?.listaId ||
    req.url?.split('/').pop()?.split('?')[0];

  if (!listaId) {
    return sendError(res, 400, 'MISSING_ID', 'ID da lista é obrigatório');
  }

  const docRef = db.collection('coleta_listas').doc(listaId);

  if (req.method === 'GET') {
    try {
      const snap = await docRef.get();
      if (!snap.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Lista não encontrada');
      }

      const data = snap.data();
      return sendSuccess(res, { ...data, id: snap.id });
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao obter lista', err.message);
    }
  }

  if (req.method === 'PATCH') {
    try {
      const updates = req.body || {};
      delete updates.id;
      delete updates.itens; // Garante que nunca regrava array itens no documento pai

      const cleanedUpdates = {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      };

      await docRef.set(cleanedUpdates, { merge: true });
      const updatedSnap = await docRef.get();

      return sendSuccess(res, { ...updatedSnap.data(), id: updatedSnap.id });
    } catch (err: any) {
      return sendError(res, 500, 'UPDATE_FAILED', 'Erro ao atualizar lista', err.message);
    }
  }

  if (req.method === 'DELETE') {
    try {
      // 1. Excluir subcoleção itens em chunks de 400
      const itemsCol = docRef.collection('itens');
      let totalDeletedItems = 0;

      while (true) {
        const snap = await itemsCol.limit(400).get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        totalDeletedItems += snap.docs.length;
      }

      // 2. Excluir documento da lista
      await docRef.delete();

      logApi('info', 'Lista e subcoleção excluídas com sucesso', {
        endpoint: '/api/listas/[id]',
        listaId,
        deletedItems: totalDeletedItems,
        durationMs: Date.now() - startTime,
      });

      return sendSuccess(res, { deleted: true, listaId, deletedItems: totalDeletedItems });
    } catch (err: any) {
      return sendError(res, 500, 'DELETE_FAILED', 'Erro ao excluir lista', err.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
