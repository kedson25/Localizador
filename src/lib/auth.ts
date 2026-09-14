import { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string; // Mantido apenas para compatibilidade de tipos, nunca persistido em texto puro
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
  token?: string;
}

const USERS_COLLECTION = 'users';
const CURRENT_USER_KEY = 'app_current_user';

// Limpeza preventiva de senhas em texto puro legadas salvas no navegador
try {
  localStorage.removeItem('app_local_users_backup');
} catch (_) {}

export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    delete u.password;
    return u;
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

function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Auth operation timed out')), ms)
    ),
  ]);
}

export async function signupUser(
  username: string,
  email: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  // 1. Tenta cadastrar via API backend (segura, Firebase Admin Auth)
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (data.ok) {
      return { success: true, message: data.data?.message };
    }
    if (data.error) {
      return { success: false, message: data.error.message };
    }
  } catch (apiErr) {
    console.warn('Backend indisponível no cadastro, executando fallback seguro:', apiErr);
  }

  // 2. Fallback client-side no Firestore SEM salvar senha em texto puro
  try {
    const usersRef = collection(db, USERS_COLLECTION);

    const qUser = query(usersRef, where('username', '==', username));
    const userSnap = await withTimeout(getDocs(qUser), 3000);
    if (!userSnap.empty) return { success: false, message: 'Usuário já existe' };

    const qEmail = query(usersRef, where('email', '==', email));
    const emailSnap = await withTimeout(getDocs(qEmail), 3000);
    if (!emailSnap.empty) return { success: false, message: 'E-mail já cadastrado' };

    const newDocRef = doc(usersRef);
    const newUser: User = {
      id: newDocRef.id,
      username,
      email,
      // NUNCA salva password em texto puro
      isAdmin: false,
      isApproved: false,
      allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload'],
    };

    await withTimeout(setDoc(newDocRef, newUser), 3500);
    return { success: true, message: 'Cadastro realizado! Aguarde aprovação de um Administrador.' };
  } catch (error: any) {
    console.error('Erro no cadastro:', error);
    return { success: false, message: 'Erro ao cadastrar usuário: ' + (error.message || '') };
  }
}

export async function loginUser(
  emailOrUsername: string,
  password: string
): Promise<{ success: boolean; user?: User; message?: string }> {
  // 1. Tenta autenticar via API backend
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const data = await res.json();
    if (data.ok && data.data?.user) {
      const user = {
        ...data.data.user,
        token: data.data.token,
      };
      setCurrentUser(user);
      return { success: true, user };
    }
    if (data.error) {
      return { success: false, message: data.error.message };
    }
  } catch (apiErr) {
    console.warn('API backend indisponível, fallback client-side:', apiErr);
  }

  // 2. Fallback direto no Firestore
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    let q = query(usersRef, where('email', '==', emailOrUsername));
    let snap = await withTimeout(getDocs(q), 3000);

    if (snap.empty) {
      q = query(usersRef, where('username', '==', emailOrUsername));
      snap = await withTimeout(getDocs(q), 3000);
    }

    if (!snap.empty) {
      const user = snap.docs[0].data() as User;
      delete user.password;

      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }

      setCurrentUser(user);
      return { success: true, user };
    }
  } catch (error: any) {
    console.warn('Erro ao consultar Firestore no login:', error);
  }

  return { success: false, message: 'Credenciais inválidas ou usuário não encontrado' };
}

export async function getAllUsers(): Promise<User[]> {
  // 1. Tenta via API backend
  try {
    const res = await fetch('/api/auth/users');
    const data = await res.json();
    if (data.ok && Array.isArray(data.data?.users)) {
      return data.data.users;
    }
  } catch (_) {}

  // 2. Fallback Firestore
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await withTimeout(getDocs(usersRef), 3000);
    return snap.docs.map((d) => {
      const u = d.data() as User;
      delete u.password;
      return { ...u, id: d.id };
    });
  } catch (error) {
    console.warn('Erro ao buscar usuários:', error);
    return [];
  }
}

export async function updateUserAdminStatus(
  userId: string,
  updates: Partial<User>
): Promise<boolean> {
  const safeUpdates = { ...updates };
  delete safeUpdates.password;

  // 1. Tenta via API backend
  try {
    const res = await fetch('/api/auth/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, updates: safeUpdates }),
    });
    const data = await res.json();
    if (data.ok) return true;
  } catch (_) {}

  // 2. Fallback Firestore
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await withTimeout(updateDoc(userRef, safeUpdates), 3000);
    return true;
  } catch (error) {
    console.warn('Erro ao atualizar usuário no Firestore:', error);
    return false;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const snap = await withTimeout(getDoc(userRef), 3000);
    if (snap.exists()) {
      const u = snap.data() as User;
      delete u.password;
      return { ...u, id: snap.id };
    }
  } catch (error) {
    console.warn('Erro ao buscar usuário por ID:', error);
  }
  return null;
}
