import { adminDb } from '../_lib/firebase-admin';
import { LoginSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { verifyEmailPassword } from '../_lib/password-auth';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'INVALID_PAYLOAD', 'Dados de login inválidos');
    }

    const { emailOrUsername, password } = parseResult.data;
    const { db } = adminDb;

    const userCol = db.collection('users');
    let snap = await userCol.where('email', '==', emailOrUsername).limit(1).get();
    if (snap.empty) {
      snap = await userCol.where('username', '==', emailOrUsername).limit(1).get();
    }

    if (snap.empty) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    if (!userData.isApproved) {
      return sendError(res, 403, 'NOT_APPROVED', 'Acesso pendente de aprovação por um Administrador.');
    }

    let idToken: string;
    try {
      idToken = await verifyEmailPassword(String(userData.email || ''), password);
    } catch (authErr: any) {
      logApi('warn', 'Tentativa de login rejeitada', {
        endpoint: '/api/auth/login',
        uid: userDoc.id,
        reason: authErr?.message || 'INVALID_CREDENTIALS',
      });

      if (authErr?.message === 'AUTH_NOT_CONFIGURED') {
        return sendError(res, 500, 'AUTH_NOT_CONFIGURED', 'Autenticação do servidor não configurada');
      }

      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
    }

    const safeUser = {
      id: userDoc.id,
      username: userData.username,
      email: userData.email,
      isAdmin: Boolean(userData.isAdmin),
      isApproved: Boolean(userData.isApproved),
      allowedGroups: Array.isArray(userData.allowedGroups) ? userData.allowedGroups : [],
    };

    logApi('info', 'Login autenticado com sucesso', {
      endpoint: '/api/auth/login',
      uid: userDoc.id,
      username: userData.username,
    });

    return sendSuccess(res, {
      token: idToken,
      user: safeUser,
    });
  } catch (err: any) {
    return sendError(res, 500, 'LOGIN_FAILED', 'Erro ao realizar login', err.message);
  }
}
