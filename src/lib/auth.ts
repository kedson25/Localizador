import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  is_approved: boolean;
  allowed_groups: string[];
}

const USER_COLUMNS = 'id,username,email,is_admin,is_approved,allowed_groups';
const legacyFirebaseApiKey = import.meta.env.VITE_FIREBASE_LEGACY_AUTH_API_KEY?.trim()
  || 'AIzaSyCfpBmn3cdKP9vaGrDzKCB7oRPMSMx02tA';

interface LegacyFirebaseUser {
  localId: string;
  email: string;
  displayName?: string;
}

class LegacyMigrationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'LegacyMigrationError';
  }
}

let interactiveAuth: Promise<void> | null = null;
async function runInteractiveAuth<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  interactiveAuth = pending;
  try {
    return await operation();
  } finally {
    if (interactiveAuth === pending) interactiveAuth = null;
    release();
  }
}

function authErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

function isInvalidCredentials(error: unknown): boolean {
  return ['invalid_credentials', 'user_not_found'].includes(authErrorCode(error));
}

async function verifyLegacyFirebaseLogin(email: string, password: string): Promise<LegacyFirebaseUser | null> {
  let response: Response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(legacyFirebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return null;
  }

  const body = await response.json().catch(() => ({})) as {
    localId?: string;
    email?: string;
    displayName?: string;
    error?: { message?: string };
  };
  if (response.ok && body.localId && body.email) {
    return { localId: body.localId, email: body.email, displayName: body.displayName };
  }

  const legacyCode = body.error?.message?.split(' : ')[0] || '';
  if (['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD'].includes(legacyCode)) return null;
  if (legacyCode === 'USER_DISABLED') throw new LegacyMigrationError('Esta conta antiga está desativada.', 'user_disabled');
  if (legacyCode.includes('TOO_MANY_ATTEMPTS')) {
    throw new LegacyMigrationError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', 'over_request_rate_limit');
  }
  return null;
}

async function signInWithPasswordOrMigrate(email: string, password: string): Promise<string> {
  const firstAttempt = await supabase.auth.signInWithPassword({ email, password });
  if (!firstAttempt.error) return firstAttempt.data.user.id;
  if (!isInvalidCredentials(firstAttempt.error)) throw firstAttempt.error;

  const legacyUser = await verifyLegacyFirebaseLogin(email, password);
  if (!legacyUser) throw firstAttempt.error;

  const username = legacyUser.displayName?.trim() || legacyUser.email.split('@')[0];
  const signup = await supabase.auth.signUp({
    email: legacyUser.email,
    password,
    options: { data: { username, legacy_firebase_uid: legacyUser.localId } },
  });
  if (!signup.error && signup.data.user && signup.data.user.identities?.length !== 0) {
    if (signup.data.session) return signup.data.user.id;
    const confirmed = await supabase.auth.signInWithPassword({ email: legacyUser.email, password });
    if (!confirmed.error) return confirmed.data.user.id;
    throw confirmed.error;
  }

  // A simultaneous first login may have created the account between requests.
  const retry = await supabase.auth.signInWithPassword({ email: legacyUser.email, password });
  if (!retry.error) return retry.data.user.id;
  if (signup.error && !['email_exists', 'user_already_exists', 'user_already_registered'].includes(authErrorCode(signup.error))) {
    throw signup.error;
  }
  throw new LegacyMigrationError(
    'A senha antiga foi validada, mas já existe uma conta Supabase com outra senha. Use a senha cadastrada no Supabase.',
    'legacy_account_conflict',
  );
}

export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  if (['invalid_credentials', 'user_not_found'].includes(code)) return 'E-mail ou senha inválidos.';
  if (['email_exists', 'user_already_exists', 'user_already_registered'].includes(code)) return 'E-mail já cadastrado. Faça login para continuar.';
  if (code === 'email_not_confirmed') return 'Confirme o e-mail enviado pelo Supabase antes de entrar.';
  if (code === 'weak_password') return 'A senha precisa ter pelo menos 6 caracteres.';
  if (['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code) || status === 429) return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  if (code === 'signup_disabled') return 'Novos cadastros estão desativados no Supabase.';
  if (code === '42501') return 'Você não tem permissão para realizar esta operação.';
  if (status >= 500) return 'O serviço de autenticação está indisponível. Tente novamente.';
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível concluir a autenticação. Verifique a conexão e tente novamente.';
}

function fromUserRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    isAdmin: row.is_admin,
    isApproved: row.is_approved,
    allowedGroups: row.allowed_groups || [],
  };
}

export function normalizeUser(user: User): User {
  return { ...user, allowedGroups: Array.isArray(user.allowedGroups) ? [...user.allowedGroups] : [] };
}

export async function signupUser(username: string, email: string, password: string): Promise<{ success: boolean; message?: string }> {
  return runInteractiveAuth(async () => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) throw error;
      if (!data.user || data.user.identities?.length === 0) {
        return { success: false, message: 'E-mail já cadastrado. Faça login para continuar.' };
      }

      const requiresConfirmation = !data.session;
      if (data.session) await supabase.auth.signOut();
      return {
        success: true,
        message: requiresConfirmation
          ? 'Cadastro realizado! Confirme o e-mail enviado pelo Supabase e depois faça login.'
          : 'Cadastro realizado! Você já pode fazer login.',
      };
    } catch (error) {
      await supabase.auth.signOut();
      return { success: false, message: authErrorMessage(error) };
    }
  });
}

export async function loginUser(email: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> {
  return runInteractiveAuth(async () => {
    try {
      const userId = await signInWithPasswordOrMigrate(email.trim().toLowerCase(), password);
      const user = await getUserById(userId);
      if (!user) throw new Error('Perfil não encontrado. Crie a conta novamente ou verifique a tabela users.');
      if (!user.isApproved) {
        await supabase.auth.signOut();
        return { success: false, message: 'Acesso desativado por um Administrador.' };
      }
      return { success: true, user };
    } catch (error) {
      await supabase.auth.signOut();
      return { success: false, message: authErrorMessage(error) };
    }
  });
}

export async function logoutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('users').select(USER_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(authErrorMessage(error));
  return data ? fromUserRow(data as UserRow) : null;
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase.rpc('list_visible_users', {});
  if (error) throw new Error(authErrorMessage(error));
  return (data as UserRow[]).map(fromUserRow);
}

export async function updateUserAdminStatus(userId: string, updates: Partial<User>): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_user_permissions', {
    p_user_id: userId,
    p_is_admin: updates.isAdmin ?? null,
    p_is_approved: updates.isApproved ?? null,
    p_allowed_groups: updates.allowedGroups ?? null,
  });
  if (error) throw new Error(authErrorMessage(error));
  return data;
}

/** Supabase Auth owns the session; profile permissions always come from PostgreSQL. */
export function subscribeAuthSession(onChange: (user: User | null) => void, onError: (message: string) => void): () => void {
  let disposed = false;
  let generation = 0;
  let activeUserId: string | null = null;
  let profileChannel: ReturnType<typeof supabase.channel> | null = null;
  let permissionTimer: ReturnType<typeof setInterval> | null = null;

  const clearProfileListener = () => {
    if (profileChannel) void supabase.removeChannel(profileChannel);
    profileChannel = null;
    if (permissionTimer) clearInterval(permissionTimer);
    permissionTimer = null;
  };

  const handleSession = (session: Session | null) => {
    const thisGeneration = ++generation;
    activeUserId = session?.user.id ?? null;
    clearProfileListener();
    void (async () => {
      if (interactiveAuth) await interactiveAuth;
      if (disposed || generation !== thisGeneration || activeUserId !== (session?.user.id ?? null)) return;
      if (!session) { onChange(null); return; }
      const userId = session.user.id;
      const isCurrent = () => !disposed && generation === thisGeneration && activeUserId === userId;
      const refreshProfile = async () => {
        try {
          const profile = await getUserById(userId);
          if (!isCurrent()) return;
          onChange(profile?.isApproved ? profile : null);
          if (!profile?.isApproved) {
            onError(profile ? 'Acesso desativado por um Administrador.' : 'Perfil não encontrado na tabela users.');
            await supabase.auth.signOut();
          }
        } catch (error) {
          if (isCurrent()) { onChange(null); onError(authErrorMessage(error)); }
        }
      };

      profileChannel = supabase.channel(`user-permissions:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${userId}` }, () => { void refreshProfile(); })
        .subscribe();
      await refreshProfile();
      if (isCurrent()) permissionTimer = setInterval(() => { void refreshProfile(); }, 60_000);
    })();
  };

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => handleSession(session));
  const initialGeneration = generation;
  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) { if (!disposed) onError(authErrorMessage(error)); return; }
    if (!disposed && generation === initialGeneration) handleSession(data.session);
  });

  return () => {
    disposed = true;
    generation += 1;
    listener.subscription.unsubscribe();
    clearProfileListener();
  };
}
