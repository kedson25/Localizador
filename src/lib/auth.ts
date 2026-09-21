import { doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { db } from './firebase';

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

const USERS_COLLECTION = 'users';
const CURRENT_USER_KEY = 'app_current_user';

try {
  localStorage.removeItem('app_local_users_backup');
  localStorage.removeItem('currentUser');
} catch (_) {}

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

async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const auth = getAuth();
  const firebaseUser = auth.currentUser;
  const saved = getCurrentUser();
  const token = firebaseUser ? await firebaseUser.getIdToken() : saved?.token;

  return fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function signupUser(
  username: string,
  email: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/auth?action=signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      return { success: true, message: data.data?.message };
    }

    return {
      success: false,
      message: data?.error?.message || 'Não foi possível realizar o cadastro',
    };
  } catch (error: any) {
    console.error('Erro no cadastro:', error);
    return { success: false, message: 'Servidor indisponível. Tente novamente.' };
  }
}

export async function loginUser(
  emailOrUsername: string,
  password: string
): Promise<{ success: boolean; user?: User; message?: string }> {
  try {
    const res = await fetch('/api/auth?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: emailOrUsername.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok || !data.data?.user || !data.data?.customToken) {
      return {
        success: false,
        message: data?.error?.message || 'Credenciais inválidas',
      };
    }

    const credential = await signInWithCustomToken(getAuth(), data.data.customToken);
    const freshIdToken = await credential.user.getIdToken(true);

    const user: User = {
      ...data.data.user,
      token: freshIdToken,
    };

    setCurrentUser(user);
    return { success: true, user };
  } catch (error: any) {
    console.error('Erro no login:', error);
    return { success: false, message: 'Não foi possível autenticar. Tente novamente.' };
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const res = await authenticatedFetch('/api/auth?action=users');
    const data = await res.json();
    if (res.ok && data.ok && Array.isArray(data.data?.users)) {
      return data.data.users;
    }
  } catch (error) {
    console.warn('Erro ao buscar usuários:', error);
  }
  return [];
}

export async function updateUserAdminStatus(
  userId: string,
  updates: Partial<User>
): Promise<boolean> {
  const safeUpdates = { ...updates };
  delete safeUpdates.password;
  delete safeUpdates.token;
  delete safeUpdates.id;
  delete safeUpdates.username;
  delete safeUpdates.email;

  try {
    const res = await authenticatedFetch('/api/auth?action=users', {
      method: 'PATCH',
      body: JSON.stringify({ userId, updates: safeUpdates }),
    });
    const data = await res.json();
    return Boolean(res.ok && data.ok);
  } catch (error) {
    console.warn('Erro ao atualizar usuário:', error);
    return false;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!snap.exists()) return null;

    const user = snap.data() as User;
    delete user.password;
    return { ...user, id: snap.id };
  } catch (error) {
    console.warn('Erro ao buscar usuário por ID:', error);
    return null;
  }
}

export async function deleteUser(userId: string): Promise<boolean> {
  try {
    const res = await authenticatedFetch('/api/auth?action=users', {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    return Boolean(res.ok && data.ok);
  } catch (error) {
    console.warn('Erro ao excluir usuário:', error);
    return false;
  }
}

export async function logoutUser() {
  try {
    await signOut(getAuth());
  } catch (_) {}
  setCurrentUser(null);
  window.location.reload();
}
