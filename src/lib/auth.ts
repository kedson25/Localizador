import { supabase, getSupabaseAccessToken } from './supabase';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
  token?: string;
}

const CURRENT_USER_KEY = 'app_current_user';

try {
  localStorage.removeItem('app_local_users_backup');
  localStorage.removeItem('currentUser');
} catch (_) {}

function profileToUser(profile: any, token?: string | null): User {
  return {
    id: String(profile.id),
    username: String(profile.username || profile.email?.split('@')[0] || 'usuario'),
    email: String(profile.email || ''),
    isAdmin: Boolean(profile.is_admin),
    isApproved: Boolean(profile.is_approved),
    allowedGroups: Array.isArray(profile.allowed_groups) ? profile.allowed_groups : [],
    token: token || undefined,
  };
}

export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    delete user.password;
    return user;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: User | null) {
  try {
    if (!user) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return;
    }

    const safeUser = { ...user };
    delete safeUser.password;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
  } catch (_) {}
}

async function resolveLoginEmail(login: string): Promise<string> {
  const trimmed = login.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();

  const { data, error } = await supabase.rpc('resolve_login_email', {
    p_login: trimmed,
  });

  if (error || !data) {
    throw new Error('Credenciais inválidas');
  }

  return String(data).toLowerCase();
}

async function loadOwnProfile(userId: string): Promise<User | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email, is_admin, is_approved, allowed_groups')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    console.warn('Perfil do Supabase não encontrado:', error);
    return null;
  }

  return profileToUser(data, token);
}

export async function signupUser(
  username: string,
  email: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
        },
      },
    });

    if (error) {
      const duplicate = /already|registered|exists|unique/i.test(error.message || '');
      return {
        success: false,
        message: duplicate
          ? 'E-mail ou usuário já cadastrado.'
          : error.message || 'Não foi possível realizar o cadastro.',
      };
    }

    if (data.session) {
      await supabase.auth.signOut();
    }

    return {
      success: true,
      message: 'Cadastro realizado com sucesso! Aguarde aprovação de um Administrador.',
    };
  } catch (error: any) {
    console.error('Erro no cadastro Supabase:', error);
    return {
      success: false,
      message: error?.message || 'Servidor indisponível. Tente novamente.',
    };
  }
}

export async function loginUser(
  emailOrUsername: string,
  password: string
): Promise<{ success: boolean; user?: User; message?: string }> {
  try {
    const email = await resolveLoginEmail(emailOrUsername);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      return {
        success: false,
        message: 'Credenciais inválidas',
      };
    }

    const user = await loadOwnProfile(data.user.id);
    if (!user) {
      await supabase.auth.signOut();
      return {
        success: false,
        message: 'Perfil de usuário não encontrado.',
      };
    }

    if (!user.isApproved) {
      await supabase.auth.signOut();
      return {
        success: false,
        message: 'Acesso pendente de aprovação por um Administrador.',
      };
    }

    user.token = data.session.access_token;
    setCurrentUser(user);
    return { success: true, user };
  } catch (error: any) {
    console.error('Erro no login Supabase:', error);
    return {
      success: false,
      message: error?.message || 'Não foi possível autenticar. Tente novamente.',
    };
  }
}

export async function refreshCurrentUser(): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setCurrentUser(null);
      return null;
    }

    const user = await loadOwnProfile(data.user.id);
    if (user?.isApproved) {
      setCurrentUser(user);
      return user;
    }

    setCurrentUser(null);
    return null;
  } catch {
    return getCurrentUser();
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const token = await getSupabaseAccessToken();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, is_admin, is_approved, allowed_groups, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((profile) => profileToUser(profile, token));
  } catch (error) {
    console.warn('Erro ao buscar usuários no Supabase:', error);
    return [];
  }
}

export async function updateUserAdminStatus(
  userId: string,
  updates: Partial<User>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.isAdmin !== undefined) payload.is_admin = updates.isAdmin;
    if (updates.isApproved !== undefined) payload.is_approved = updates.isApproved;
    if (updates.allowedGroups !== undefined) payload.allowed_groups = updates.allowedGroups;

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error) throw error;

    const current = getCurrentUser();
    if (current?.id === userId) {
      const refreshed = await loadOwnProfile(userId);
      if (refreshed) setCurrentUser(refreshed);
    }

    return true;
  } catch (error) {
    console.warn('Erro ao atualizar usuário no Supabase:', error);
    return false;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, is_admin, is_approved, allowed_groups')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return profileToUser(data, await getSupabaseAccessToken());
  } catch (error) {
    console.warn('Erro ao buscar usuário no Supabase:', error);
    return null;
  }
}

export async function deleteUser(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('admin_delete_user', {
      p_user_id: userId,
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Erro ao excluir usuário no Supabase:', error);
    return false;
  }
}

export async function logoutUser() {
  try {
    await supabase.auth.signOut();
  } catch (_) {}

  setCurrentUser(null);
  window.location.reload();
}
