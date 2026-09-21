import { LoginSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin, getSupabaseAuthClient } from '../_lib/supabase-admin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'INVALID_PAYLOAD', 'Dados de login inválidos');
    }

    const { emailOrUsername, password } = parsed.data;
    const login = emailOrUsername.trim();
    const admin = getSupabaseAdmin();

    let profileQuery = admin
      .from('profiles')
      .select('id, username, email, is_admin, is_approved, allowed_groups');

    if (login.includes('@')) {
      profileQuery = profileQuery.eq('email', login.toLowerCase());
    } else {
      profileQuery = profileQuery.ilike('username', login);
    }

    const { data: profile, error: profileError } = await profileQuery.maybeSingle();

    if (profileError || !profile?.email) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
    }

    const authClient = getSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: String(profile.email),
      password,
    });

    if (authError || !authData.user || !authData.session) {
      logApi('warn', 'Tentativa de login rejeitada', {
        endpoint: '/api/auth/login',
        uid: profile.id,
      });
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
    }

    if (!profile.is_approved) {
      return sendError(
        res,
        403,
        'NOT_APPROVED',
        'Acesso pendente de aprovação por um Administrador.'
      );
    }

    const user = {
      id: String(profile.id),
      username: String(profile.username || ''),
      email: String(profile.email || ''),
      isAdmin: Boolean(profile.is_admin),
      isApproved: Boolean(profile.is_approved),
      allowedGroups: Array.isArray(profile.allowed_groups) ? profile.allowed_groups : [],
    };

    logApi('info', 'Login Supabase autenticado com sucesso', {
      endpoint: '/api/auth/login',
      uid: user.id,
      username: user.username,
    });

    return sendSuccess(res, {
      user,
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at,
    });
  } catch (err: any) {
    const configError = String(err?.message || '').includes('NOT_CONFIGURED');
    if (configError) {
      return sendError(
        res,
        500,
        'AUTH_NOT_CONFIGURED',
        'Autenticação Supabase do servidor não configurada'
      );
    }

    return sendError(res, 500, 'LOGIN_FAILED', 'Erro ao realizar login', err?.message);
  }
}
