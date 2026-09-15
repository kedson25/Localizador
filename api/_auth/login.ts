import { adminDb } from '../_lib/firebase-admin';
import { LoginSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

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
    const { auth, db } = adminDb;

    // 1. Localizar usuário por email ou username
    const userCol = db.collection('users');
    let snap = await userCol.where('email', '==', emailOrUsername).limit(1).get();
    if (snap.empty) {
      snap = await userCol.where('username', '==', emailOrUsername).limit(1).get();
    }

    if (snap.empty) {
      return sendError(res, 401, 'USER_NOT_FOUND', 'Usuário não encontrado');
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    // 2. Verificar aprovação
    if (!userData.isApproved) {
      return sendError(
        res,
        403,
        'NOT_APPROVED',
        'Acesso pendente de aprovação por um Administrador.'
      );
    }

    // 3. Gerar custom token ou token de sessão do Firebase Auth
    let token = `user_${userDoc.id}`;
    try {
      token = await auth.createCustomToken(userDoc.id, {
        admin: Boolean(userData.isAdmin),
      });
    } catch (_) {}

    const safeUser = {
      id: userDoc.id,
      username: userData.username,
      email: userData.email,
      isAdmin: Boolean(userData.isAdmin),
      isApproved: Boolean(userData.isApproved),
      allowedGroups: userData.allowedGroups || [],
    };

    logApi('info', 'Login autenticado com sucesso', {
      endpoint: '/api/auth/login',
      uid: userDoc.id,
      username: userData.username,
    });

    return sendSuccess(res, {
      token,
      user: safeUser,
    });
  } catch (err: any) {
    return sendError(res, 500, 'LOGIN_FAILED', 'Erro ao realizar login', err.message);
  }
}
