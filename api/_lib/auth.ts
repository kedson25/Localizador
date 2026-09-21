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

function getBearerToken(req: IncomingMessage & { headers: Record<string, any> }): string {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    throw new AuthError('UNAUTHORIZED', 'Autenticação obrigatória.');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new AuthError('UNAUTHORIZED', 'Token de autenticação inválido.');
  }

  return match[1].trim();
}

export async function requireAuth(
  req: IncomingMessage & { headers: Record<string, any> }
): Promise<AuthenticatedUser> {
  const token = getBearerToken(req);

  try {
    const { auth, db } = adminDb;

    // checkRevoked=true: tokens revogados deixam de ser aceitos imediatamente.
    const decodedToken = await auth.verifyIdToken(token, true);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      throw new AuthError('PROFILE_NOT_FOUND', 'Perfil de usuário não encontrado.', 403);
    }

    const userData = userDoc.data() || {};

    return {
      uid,
      email: decodedToken.email || userData.email,
      displayName: decodedToken.name || userData.username || 'Usuário',
      isAdmin: Boolean(userData.isAdmin),
      isApproved: Boolean(userData.isApproved),
      allowedGroups: Array.isArray(userData.allowedGroups)
        ? userData.allowedGroups.filter((group: unknown): group is string => typeof group === 'string')
        : [],
    };
  } catch (err: any) {
    if (err instanceof AuthError) {
      throw err;
    }

    throw new AuthError('INVALID_TOKEN', 'Sessão inválida ou expirada. Faça login novamente.');
  }
}

export async function requireApproved(
  req: IncomingMessage & { headers: Record<string, any> }
): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isApproved) {
    throw new AuthError('NOT_APPROVED', 'Usuário ainda não aprovado.', 403);
  }
  return user;
}

export async function requireAdmin(
  req: IncomingMessage & { headers: Record<string, any> }
): Promise<AuthenticatedUser> {
  const user = await requireApproved(req);
  if (!user.isAdmin) {
    throw new AuthError('FORBIDDEN', 'Permissão de administrador obrigatória.', 403);
  }
  return user;
}

export function normalizeAuthError(err: any) {
  if (err instanceof AuthError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
    };
  }

  return {
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Autenticação obrigatória.',
  };
}
