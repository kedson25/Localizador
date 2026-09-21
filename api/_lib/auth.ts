import type { IncomingMessage } from 'http';
import { getSupabaseAdmin } from './supabase-admin';

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

function getBearerToken(
  req: IncomingMessage & { headers: Record<string, any> }
): string {
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
    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      throw new AuthError(
        'INVALID_TOKEN',
        'Sessão inválida ou expirada. Faça login novamente.'
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, email, is_admin, is_approved, allowed_groups')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      throw new AuthError(
        'PROFILE_NOT_FOUND',
        'Perfil de usuário não encontrado.',
        403
      );
    }

    return {
      uid: authData.user.id,
      email: authData.user.email || profile.email || undefined,
      displayName:
        profile.username || authData.user.user_metadata?.username || 'Usuário',
      isAdmin: Boolean(profile.is_admin),
      isApproved: Boolean(profile.is_approved),
      allowedGroups: Array.isArray(profile.allowed_groups)
        ? profile.allowed_groups.filter(
            (group: unknown): group is string => typeof group === 'string'
          )
        : [],
    };
  } catch (err: any) {
    if (err instanceof AuthError) throw err;

    throw new AuthError(
      'INVALID_TOKEN',
      'Sessão inválida ou expirada. Faça login novamente.'
    );
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
    throw new AuthError(
      'FORBIDDEN',
      'Permissão de administrador obrigatória.',
      403
    );
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
