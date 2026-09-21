import { SignupSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        'Dados inválidos para cadastro',
        parsed.error.format()
      );
    }

    const username = parsed.data.username.trim();
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const supabase = getSupabaseAdmin();

    const [{ data: sameUsername }, { data: sameEmail }] = await Promise.all([
      supabase.from('profiles').select('id').ilike('username', username).limit(1),
      supabase.from('profiles').select('id').eq('email', email).limit(1),
    ]);

    if ((sameUsername || []).length > 0) {
      return sendError(res, 400, 'USER_EXISTS', 'Nome de usuário já cadastrado');
    }
    if ((sameEmail || []).length > 0) {
      return sendError(res, 400, 'EMAIL_EXISTS', 'E-mail já cadastrado');
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });

    if (error || !data.user) {
      const message = error?.message || 'Falha ao criar usuário';
      if (/already|registered|exists/i.test(message)) {
        return sendError(res, 400, 'EMAIL_EXISTS', 'E-mail já cadastrado');
      }
      throw error || new Error(message);
    }

    // O trigger on_auth_user_created cria o perfil. Aguarda e confirma o registro.
    let profile: any = null;
    for (let attempt = 0; attempt < 4 && !profile; attempt++) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, email, is_admin, is_approved, allowed_groups')
        .eq('id', data.user.id)
        .maybeSingle();
      profile = profileData;
      if (!profile) await new Promise((resolve) => setTimeout(resolve, 80));
    }

    if (!profile) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      return sendError(
        res,
        500,
        'PROFILE_CREATE_FAILED',
        'Conta criada, mas o perfil não foi inicializado no banco.'
      );
    }

    logApi('info', 'Novo usuário registrado no Supabase', {
      endpoint: '/api/auth/signup',
      uid: data.user.id,
      username,
    });

    return sendSuccess(
      res,
      {
        success: true,
        message: profile.is_approved
          ? 'Cadastro realizado com sucesso!'
          : 'Cadastro realizado com sucesso! Aguarde aprovação de um Administrador.',
        user: {
          id: data.user.id,
          username: profile.username,
          email: profile.email,
          isAdmin: Boolean(profile.is_admin),
          isApproved: Boolean(profile.is_approved),
          allowedGroups: Array.isArray(profile.allowed_groups)
            ? profile.allowed_groups
            : [],
        },
      },
      201
    );
  } catch (err: any) {
    return sendError(
      res,
      500,
      'SIGNUP_FAILED',
      'Erro ao registrar usuário',
      err?.message
    );
  }
}
