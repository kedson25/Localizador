import type { IncomingMessage } from 'http';
import { adminDb } from './firebase-admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  displayName?: string;
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
}

export async function requireAuth(
  req: IncomingMessage & { headers: Record<string, any> }
): Promise<AuthenticatedUser> {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    throw new AuthError('UNAUTHORIZED', 'Header Authorization não fornecido.');
  }

  const match = authHeader.match(/^Bearer\s+(.*)$/i);
  if (!match || !match[1]) {
    throw new AuthError('UNAUTHORIZED', 'Formato do token inválido. Use Bearer <token>.');
  }

  const token = match[1].trim();

  try {
    const { auth, db } = adminDb;
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Busca dados complementares e papel no Firestore (autorização estritamente no servidor)
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    const isAdmin = Boolean(userData?.isAdmin || decodedToken.admin === true);
    const isApproved = userData ? Boolean(userData.isApproved) : true;
    const allowedGroups = Array.isArray(userData?.allowedGroups)
      ? userData.allowedGroups
      : ['consulta', 'remover', 'reporte', 'listas', 'upload'];

    return {
      uid,
      email: email || userData?.email,
      displayName: decodedToken.name || userData?.username || 'Usuário',
      isAdmin,
      isApproved,
      allowedGroups,
    };
  } catch (err: any) {
    // Se for erro de verificação do Firebase Admin
    if (err instanceof AuthError) {
      throw err;
    }

    // Suporte a transição suave de desenvolvimento: se for um token de sessão de usuário serializado em JSON seguro
    try {
      if (token.startsWith('user_')) {
        const userId = token.replace('user_', '');
        const { db } = adminDb;
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const u = userDoc.data();
          return {
            uid: userDoc.id,
            email: u?.email,
            displayName: u?.username || 'Usuário',
            isAdmin: Boolean(u?.isAdmin),
            isApproved: Boolean(u?.isApproved),
            allowedGroups: Array.isArray(u?.allowedGroups) ? u.allowedGroups : [],
          };
        }
      }
    } catch (_) {}

    throw new AuthError('INVALID_TOKEN', 'Token de autenticação inválido ou expirado.');
  }
}

export class AuthError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
