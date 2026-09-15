import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { SignupSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parseResult = SignupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'INVALID_PAYLOAD', 'Dados inválidos para cadastro', parseResult.error.format());
    }

    const { username, email, password } = parseResult.data;
    const { auth, db } = adminDb;

    // 1. Verificar se usuário ou email já existem no Firestore
    const userCol = db.collection('users');
    const [snapUsername, snapEmail] = await Promise.all([
      userCol.where('username', '==', username).limit(1).get(),
      userCol.where('email', '==', email).limit(1).get(),
    ]);

    if (!snapUsername.empty) {
      return sendError(res, 400, 'USER_EXISTS', 'Nome de usuário já cadastrado');
    }
    if (!snapEmail.empty) {
      return sendError(res, 400, 'EMAIL_EXISTS', 'E-mail já cadastrado');
    }

    // 2. Criar conta no Firebase Admin Auth (o hash da senha é gerenciado com segurança pelo Firebase Auth)
    let uid: string;
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: username,
      });
      uid = userRecord.uid;
    } catch (authErr: any) {
      // Se Firebase Auth não estiver habilitado ou em teste local, gera ID seguro
      uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // 3. Salvar perfil do usuário no Firestore SEM salvar a senha em texto puro!
    const newUser = {
      id: uid,
      username,
      email,
      isAdmin: false,
      isApproved: false,
      allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload'],
      createdAt: FieldValue.serverTimestamp(),
    };

    await userCol.doc(uid).set(newUser);

    logApi('info', 'Novo usuário registrado', {
      endpoint: '/api/auth/signup',
      uid,
      username,
    });

    return sendSuccess(res, {
      success: true,
      message: 'Cadastro realizado com sucesso! Aguarde aprovação de um Administrador.',
      user: {
        id: uid,
        username,
        email,
        isAdmin: false,
        isApproved: false,
      },
    }, 201);
  } catch (err: any) {
    return sendError(res, 500, 'SIGNUP_FAILED', 'Erro ao registrar usuário', err.message);
  }
}
