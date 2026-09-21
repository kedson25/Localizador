import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { requireAdmin, normalizeAuthError } from '../_lib/auth';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  let currentUser;
  try {
    currentUser = await requireAdmin(req);
  } catch (err: any) {
    const authError = normalizeAuthError(err);
    return sendError(res, authError.statusCode, authError.code, authError.message);
  }

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email, is_admin, is_approved, allowed_groups, created_at')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const users = (data || []).map((profile: any) => ({
        id: String(profile.id),
        username: String(profile.username || ''),
        email: String(profile.email || ''),
        isAdmin: Boolean(profile.is_admin),
        isApproved: Boolean(profile.is_approved),
        allowedGroups: Array.isArray(profile.allowed_groups)
          ? profile.allowed_groups
          : [],
        createdAt: profile.created_at,
      }));

      return sendSuccess(res, { users });
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao listar usuários', err?.message);
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { userId, updates } = req.body || {};
      if (!userId || !updates || typeof updates !== 'object') {
        return sendError(
          res,
          400,
          'INVALID_PAYLOAD',
          'userId e updates são obrigatórios'
        );
      }

      if (
        currentUser.uid === userId &&
        (updates.isAdmin === false || updates.isApproved === false)
      ) {
        return sendError(
          res,
          409,
          'SELF_LOCKOUT_BLOCKED',
          'Não é permitido remover seu próprio acesso administrativo'
        );
      }

      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.isAdmin !== undefined) {
        if (typeof updates.isAdmin !== 'boolean') {
          return sendError(
            res,
            400,
            'INVALID_ADMIN_FLAG',
            'isAdmin deve ser booleano'
          );
        }
        payload.is_admin = updates.isAdmin;
      }

      if (updates.isApproved !== undefined) {
        if (typeof updates.isApproved !== 'boolean') {
          return sendError(
            res,
            400,
            'INVALID_APPROVAL_FLAG',
            'isApproved deve ser booleano'
          );
        }
        payload.is_approved = updates.isApproved;
      }

      if (updates.allowedGroups !== undefined) {
        if (
          !Array.isArray(updates.allowedGroups) ||
          !updates.allowedGroups.every((v: unknown) => typeof v === 'string')
        ) {
          return sendError(
            res,
            400,
            'INVALID_GROUPS',
            'allowedGroups deve ser uma lista de textos'
          );
        }
        payload.allowed_groups = updates.allowedGroups;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', String(userId))
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'Usuário não encontrado');
      }

      logApi('info', 'Usuário Supabase atualizado por admin', {
        endpoint: '/api/auth/users',
        targetUserId: userId,
        updatedBy: currentUser.uid,
      });

      return sendSuccess(res, { updated: true, userId });
    } catch (err: any) {
      return sendError(
        res,
        500,
        'UPDATE_FAILED',
        'Erro ao atualizar usuário',
        err?.message
      );
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { userId } = req.body || {};
      if (!userId) {
        return sendError(res, 400, 'INVALID_PAYLOAD', 'userId é obrigatório');
      }

      if (currentUser.uid === userId) {
        return sendError(
          res,
          409,
          'SELF_DELETE_BLOCKED',
          'Não é permitido excluir o próprio usuário administrador'
        );
      }

      const { error } = await supabase.auth.admin.deleteUser(String(userId));
      if (error && !/not found/i.test(error.message || '')) throw error;

      logApi('info', 'Usuário Supabase excluído por admin', {
        endpoint: '/api/auth/users',
        targetUserId: userId,
        deletedBy: currentUser.uid,
      });

      return sendSuccess(res, { deleted: true, userId });
    } catch (err: any) {
      return sendError(
        res,
        500,
        'DELETE_FAILED',
        'Erro ao excluir usuário',
        err?.message
      );
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
