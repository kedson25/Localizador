import { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, withTimeout } from './firebase';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
}

const USERS_COLLECTION = 'users';
const LOCAL_STORAGE_USERS_KEY = 'auth_users_cache_v1';

const DEFAULT_USERS: User[] = [
  {
    id: 'admin_default',
    username: 'admin',
    email: 'admin@admin.com',
    password: 'admin',
    isAdmin: true,
    isApproved: true,
    allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload']
  }
];

function getCachedUsers(): User[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure admin is present if not already
        const hasAdmin = parsed.some(u => u.username.toLowerCase() === 'admin' || u.isAdmin);
        if (!hasAdmin) {
          parsed.unshift(DEFAULT_USERS[0]);
        }
        return parsed;
      }
    }
  } catch (_) {}
  return [...DEFAULT_USERS];
}

function saveCachedUsers(users: User[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.warn('Erro ao salvar cache local de usuários:', err);
  }
}

export async function signupUser(username: string, email: string, password: string): Promise<{success: boolean, message?: string}> {
  const cached = getCachedUsers();
  const lowerUser = username.trim().toLowerCase();
  const lowerEmail = email.trim().toLowerCase();

  // Check locally first
  if (cached.some(u => u.username.toLowerCase() === lowerUser)) {
    return { success: false, message: 'Usuário já existe' };
  }
  if (cached.some(u => u.email.toLowerCase() === lowerEmail)) {
    return { success: false, message: 'E-mail já cadastrado' };
  }

  const newDocRef = doc(collection(db, USERS_COLLECTION));
  const newUser: User = {
    id: newDocRef.id,
    username: username.trim(),
    email: email.trim(),
    password,
    isAdmin: false,
    isApproved: false,
    allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload']
  };

  // Save to local cache immediately
  const updated = [...cached, newUser];
  saveCachedUsers(updated);

  // Attempt Firestore sync in background with timeout
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const qUser = query(usersRef, where('username', '==', username.trim()));
    const userSnap = await withTimeout(getDocs(qUser), 2000);
    if (!userSnap.empty) {
      return { success: false, message: 'Usuário já existe' };
    }

    await withTimeout(setDoc(newDocRef, newUser), 2500);
  } catch (error) {
    console.warn('Firestore offline ou lento ao criar usuário (cadastrado localmente):', error);
  }

  return { success: true };
}

export async function loginUser(emailOrUsername: string, password: string): Promise<{success: boolean, user?: User, message?: string}> {
  const term = emailOrUsername.trim().toLowerCase();

  // 1. Attempt Firestore fetch with timeout
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    let q = query(usersRef, where('email', '==', emailOrUsername.trim()));
    let snap = await withTimeout(getDocs(q), 2000);

    if (snap.empty) {
      q = query(usersRef, where('username', '==', emailOrUsername.trim()));
      snap = await withTimeout(getDocs(q), 2000);
    }

    if (!snap.empty) {
      const user = snap.docs[0].data() as User;
      if (user.password !== password) {
        return { success: false, message: 'Senha incorreta' };
      }
      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }

      // Update local cache
      const cached = getCachedUsers();
      const existingIdx = cached.findIndex(u => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase());
      if (existingIdx >= 0) {
        cached[existingIdx] = user;
      } else {
        cached.push(user);
      }
      saveCachedUsers(cached);

      return { success: true, user };
    }
  } catch (error) {
    console.warn('Firestore offline ou não responsivo, consultando usuários locais:', error);
  }

  // 2. Offline / Local fallback
  const cached = getCachedUsers();
  const matchedUser = cached.find(u => 
    u.username.toLowerCase() === term || u.email.toLowerCase() === term
  );

  if (!matchedUser) {
    return { success: false, message: 'Usuário não encontrado' };
  }

  if (matchedUser.password !== password) {
    return { success: false, message: 'Senha incorreta' };
  }

  if (!matchedUser.isApproved) {
    return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
  }

  return { success: true, user: matchedUser };
}

export async function getAllUsers(): Promise<User[]> {
  const cached = getCachedUsers();
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await withTimeout(getDocs(usersRef), 2500);
    if (!snap.empty) {
      const remoteUsers = snap.docs.map(d => d.data() as User);
      
      // Merge remote and cached
      const map = new Map<string, User>();
      cached.forEach(u => map.set(u.id, u));
      remoteUsers.forEach(u => map.set(u.id, u));
      const merged = Array.from(map.values());
      saveCachedUsers(merged);
      return merged;
    }
  } catch (error) {
    console.warn('Firestore offline ao listar usuários, usando cache local:', error);
  }
  return cached;
}

export async function updateUserAdminStatus(userId: string, updates: Partial<User>): Promise<boolean> {
  // Update local cache immediately
  const cached = getCachedUsers();
  const idx = cached.findIndex(u => u.id === userId);
  if (idx >= 0) {
    cached[idx] = { ...cached[idx], ...updates };
    saveCachedUsers(cached);
  }

  // Sync with Firestore
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await withTimeout(updateDoc(userRef, updates), 2500);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao atualizar status do usuário (atualizado localmente):', error);
    return true;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const snap = await withTimeout(getDoc(userRef), 2000);
    if (snap.exists()) {
      return snap.data() as User;
    }
  } catch (error) {
    console.warn('Firestore offline ao buscar usuário por ID, usando cache local:', error);
  }

  const cached = getCachedUsers();
  return cached.find(u => u.id === userId) || null;
}
