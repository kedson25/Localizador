import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { requireAdmin, normalizeAuthError } from '../_lib/auth';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const { db, auth } = adminDb;

  let currentUser;
  try {
    currentUser = await requireAdmin(req);
  } catch (err: any) {
    const authError = normalizeAuthError(err);
    return sendError(res, authError.statusCode, authError.code, authError.message);
  }

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
          allowedGroups: Array.isArray(data.allowedGroups) ? data.allowedGroups : [],
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
      const { userId, updates } = req.body || {};
      if (!userId || !updates || typeof updates !== 'object') {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'userId e updates são obrigatórios');
      }

      const targetRef = db.collection('users').doc(String(userId));
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'Usuário não encontrado');
      }

      const allowedKeys = ['isAdmin', 'isApproved', 'allowedGroups'] as const;
      const safeUpdates: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
          safeUpdates[key] = updates[key];
        }
      }

      if (safeUpdates.allowedGroups !== undefined) {
        if (!Array.isArray(safeUpdates.allowedGroups) || !safeUpdates.allowedGroups.every((v: unknown) => typeof v === 'string')) {
          return sendError(res, 400, 'INVALID_GROUPS', 'allowedGroups deve ser uma lista de textos');
        }
      }

      if (safeUpdates.isAdmin !== undefined && typeof safeUpdates.isAdmin !== 'boolean') {
        return sendError(res, 400, 'INVALID_ADMIN_FLAG', 'isAdmin deve ser booleano');
      }
      if (safeUpdates.isApproved !== undefined && typeof safeUpdates.isApproved !== 'boolean') {
        return sendError(res, 400, 'INVALID_APPROVAL_FLAG', 'isApproved deve ser booleano');
      }

      // Impede um administrador de remover acidentalmente o próprio acesso.
      if (currentUser.uid === userId && (safeUpdates.isAdmin === false || safeUpdates.isApproved === false)) {
        return sendError(res, 409, 'SELF_LOCKOUT_BLOCKED', 'Não é permitido remover seu próprio acesso administrativo');
      }

      await targetRef.set(safeUpdates, { merge: true });

      // Revoga sessões antigas sempre que permissões são modificadas.
      await auth.revokeRefreshTokens(String(userId));

      logApi('info', 'Usuário atualizado por admin', {
        endpoint: '/api/auth/users',
        targetUserId: userId,
        updatedBy: currentUser.uid,
      });

      return sendSuccess(res, { updated: true, userId });
    } catch (err: any) {
      return sendError(res, 500, 'UPDATE_FAILED', 'Erro ao atualizar usuário', err.message);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { userId } = req.body || {};
      if (!userId) {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'userId é obrigatório');
      }

      if (currentUser.uid === userId) {
        return sendError(res, 409, 'SELF_DELETE_BLOCKED', 'Não é permitido excluir o próprio usuário administrador');
      }

      await Promise.all([
        db.collection('users').doc(String(userId)).delete(),
        auth.deleteUser(String(userId)).catch((err: any) => {
          if (err?.code !== 'auth/user-not-found') throw err;
        }),
      ]);

      logApi('info', 'Usuário excluído por admin', {
        endpoint: '/api/auth/users',
        targetUserId: userId,
        deletedBy: currentUser.uid,
      });

      return sendSuccess(res, { deleted: true, userId });
    } catch (err: any) {
      return sendError(res, 500, 'DELETE_FAILED', 'Erro ao excluir usuário', err.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
