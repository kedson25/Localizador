import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { requireAuth } from '../_lib/auth';
import { UpdateItemSchema, DeleteItemSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const { db } = adminDb;

  if (req.method === 'PATCH') {
    try {
      const parseResult = UpdateItemSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'Dados de atualização inválidos', parseResult.error.format());
      }

      const { listaId, itemId, changes } = parseResult.data;
      const listaRef = db.collection('coleta_listas').doc(listaId);
      const itemRef = listaRef.collection('itens').doc(itemId);

      const result = await db.runTransaction(async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists) {
          throw new Error('ITEM_NOT_FOUND');
        }

        const prev = itemSnap.data() || {};
        const updated = {
          ...changes,
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(itemRef, updated, { merge: true });

        // Ajustar contadores agregados se motivo, saída ou validação foram alterados
        const listaUpdates: Record<string, any> = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (changes.validado !== undefined && prev.validado !== undefined && changes.validado !== prev.validado) {
          listaUpdates.totalValidados = FieldValue.increment(changes.validado ? 1 : -1);
        }
        if (changes.motivo && prev.motivo && changes.motivo !== prev.motivo) {
          listaUpdates[`motivosCount.${prev.motivo}`] = FieldValue.increment(-1);
          listaUpdates[`motivosCount.${changes.motivo}`] = FieldValue.increment(1);
        }
        if (changes.saida && prev.saida && changes.saida !== prev.saida) {
          listaUpdates[`saidasCount.${prev.saida}`] = FieldValue.increment(-1);
          listaUpdates[`saidasCount.${changes.saida}`] = FieldValue.increment(1);
        }

        if (Object.keys(listaUpdates).length > 1) {
          transaction.set(listaRef, listaUpdates, { merge: true });
        }

        return { ...prev, ...updated, id: itemId };
      });

      return sendSuccess(res, result);
    } catch (err: any) {
      if (err.message === 'ITEM_NOT_FOUND') {
        return sendError(res, 404, 'NOT_FOUND', 'Item não encontrado na lista');
      }
      return sendError(res, 500, 'UPDATE_FAILED', 'Erro ao atualizar item', err.message);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const parseResult = DeleteItemSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'Identificadores inválidos', parseResult.error.format());
      }

      const { listaId, itemId } = parseResult.data;
      const listaRef = db.collection('coleta_listas').doc(listaId);
      const itemRef = listaRef.collection('itens').doc(itemId);

      await db.runTransaction(async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists) {
          return; // Já deletado (idempotente)
        }

        const item = itemSnap.data() || {};
        transaction.delete(itemRef);

        // Decrementar contadores atômicos
        const listaUpdates: Record<string, any> = {
          totalItens: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (item.validado) {
          listaUpdates.totalValidados = FieldValue.increment(-1);
        }
        if (item.responsavel) {
          listaUpdates[`bipsPorOperador.${item.responsavel}`] = FieldValue.increment(-1);
        }
        if (item.saida) {
          listaUpdates[`saidasCount.${item.saida}`] = FieldValue.increment(-1);
        }
        if (item.motivo) {
          listaUpdates[`motivosCount.${item.motivo}`] = FieldValue.increment(-1);
        }

        transaction.set(listaRef, listaUpdates, { merge: true });
      });

      logApi('info', 'Item excluído com sucesso', {
        endpoint: '/api/coleta/item',
        listaId,
        itemId,
        durationMs: Date.now() - startTime,
      });

      return sendSuccess(res, { deleted: true, itemId });
    } catch (err: any) {
      return sendError(res, 500, 'DELETE_FAILED', 'Erro ao excluir item', err.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
