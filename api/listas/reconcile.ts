import { adminDb } from '../_lib/firebase-admin';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const { db } = adminDb;

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const listaId = req.body?.listaId;
    const results: Array<{ id: string; nome: string; totalItens: number; totalValidados: number }> = [];

    if (listaId) {
      const docRef = db.collection('coleta_listas').doc(listaId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Lista não encontrada');
      }

      const itemsSnap = await docRef.collection('itens').get();
      const totalItens = itemsSnap.size;
      let totalValidados = 0;
      const bipsPorOperador: Record<string, number> = {};
      const saidasCount: Record<string, number> = {};
      const motivosCount: Record<string, number> = {};

      for (const d of itemsSnap.docs) {
        const item = d.data();
        if (item.validado) totalValidados++;
        const op = item.responsavel || docSnap.data()?.responsavel || 'Operador';
        bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
        if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
        if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
      }

      await docRef.update({
        totalItens,
        totalValidados,
        bipsPorOperador,
        saidasCount,
        motivosCount,
        updatedAt: new Date(),
      });

      results.push({
        id: listaId,
        nome: docSnap.data()?.nome || '',
        totalItens,
        totalValidados,
      });
    } else {
      // Reconciliar todas as listas
      const snap = await db.collection('coleta_listas').get();
      for (const doc of snap.docs) {
        const itemsSnap = await doc.ref.collection('itens').get();
        const totalItens = itemsSnap.size;
        let totalValidados = 0;
        const bipsPorOperador: Record<string, number> = {};
        const saidasCount: Record<string, number> = {};
        const motivosCount: Record<string, number> = {};

        for (const d of itemsSnap.docs) {
          const item = d.data();
          if (item.validado) totalValidados++;
          const op = item.responsavel || doc.data()?.responsavel || 'Operador';
          bipsPorOperador[op] = (bipsPorOperador[op] || 0) + 1;
          if (item.saida) saidasCount[item.saida] = (saidasCount[item.saida] || 0) + 1;
          if (item.motivo) motivosCount[item.motivo] = (motivosCount[item.motivo] || 0) + 1;
        }

        await doc.ref.update({
          totalItens,
          totalValidados,
          bipsPorOperador,
          saidasCount,
          motivosCount,
          updatedAt: new Date(),
        });

        results.push({
          id: doc.id,
          nome: doc.data()?.nome || '',
          totalItens,
          totalValidados,
        });
      }
    }

    logApi('info', 'Contadores reconciliados com sucesso', {
      endpoint: '/api/listas/reconcile',
      durationMs: Date.now() - startTime,
      count: results.length,
    });

    return sendSuccess(res, { reconciled: results });
  } catch (err: any) {
    return sendError(res, 500, 'RECONCILE_FAILED', 'Erro ao reconciliar contadores', err.message);
  }
}
