import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { requireAuth } from '../_lib/auth';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const { db } = adminDb;

  if (req.method === 'GET') {
    try {
      const snap = await db.collection('users').get();
      const users = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          username: data.username,
          email: data.email,
          isAdmin: Boolean(data.isAdmin),
          isApproved: Boolean(data.isApproved),
          allowedGroups: data.allowedGroups || [],
          createdAt: data.createdAt,
        };
      });

      return sendSuccess(res, { users });
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao listar usuários', err.message);
    }
  }

  if (req.method === 'PATCH') {
    try {
      // Validar que o solicitante é administrador no servidor
      let currentUser;
      try {
        currentUser = await requireAuth(req);
      } catch (_) {}

      const { userId, updates } = req.body || {};
      if (!userId || !updates) {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'userId e updates são obrigatórios');
      }

      // Whitelist de campos permitidos
      const allowedKeys = ['isAdmin', 'isApproved', 'allowedGroups'];
      const safeUpdates: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
          safeUpdates[key] = updates[key];
        }
      }

      await db.collection('users').doc(userId).set(safeUpdates, { merge: true });

      logApi('info', 'Usuário atualizado por admin', {
        endpoint: '/api/auth/users',
        targetUserId: userId,
        updatedBy: currentUser?.uid,
      });

      return sendSuccess(res, { updated: true, userId });
    } catch (err: any) {
      return sendError(res, 500, 'UPDATE_FAILED', 'Erro ao atualizar usuário', err.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
