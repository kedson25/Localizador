import { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';

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
const LOCAL_USERS_KEY = 'app_local_users_backup';

function getLocalUsers(): User[] {
  try {
    const cached = localStorage.getItem(LOCAL_USERS_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function saveLocalUser(user: User) {
  try {
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.id === user.id || u.email === user.email || u.username === user.username);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...user };
    } else {
      users.push(user);
    }
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Auth operation timed out')), ms)
    ),
  ]);
}

export async function signupUser(username: string, email: string, password: string): Promise<{success: boolean, message?: string}> {
  const usersRef = collection(db, USERS_COLLECTION);
  const newDocRef = doc(usersRef);
  
  const newUser: User = {
    id: newDocRef.id,
    username,
    email,
    password,
    isAdmin: false,
    isApproved: false,
    allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload']
  };

  saveLocalUser(newUser);

  try {
    // Check if username or email exists
    const qUser = query(usersRef, where('username', '==', username));
    const userSnap = await withTimeout(getDocs(qUser), 3000);
    if (!userSnap.empty) return { success: false, message: 'Usuário já existe' };
    
    const qEmail = query(usersRef, where('email', '==', email));
    const emailSnap = await withTimeout(getDocs(qEmail), 3000);
    if (!emailSnap.empty) return { success: false, message: 'E-mail já cadastrado' };
    
    await withTimeout(setDoc(newDocRef, newUser), 3500);
    return { success: true };
  } catch (error: any) {
    console.warn('Firestore offline/timeout no cadastro (salvo localmente):', error);
    return { success: true };
  }
}

export function normalizeUser(user: User): User {
  const groups = Array.isArray(user.allowedGroups) ? [...user.allowedGroups] : [];
  if (!groups.includes('listas')) {
    groups.push('listas');
  }
  return { ...user, allowedGroups: groups };
}

export async function loginUser(emailOrUsername: string, password: string): Promise<{success: boolean, user?: User, message?: string}> {
  const localUsers = getLocalUsers();

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    let q = query(usersRef, where('email', '==', emailOrUsername));
    let snap = await withTimeout(getDocs(q), 3000);
    
    if (snap.empty) {
      q = query(usersRef, where('username', '==', emailOrUsername));
      snap = await withTimeout(getDocs(q), 3000);
    }
    
    if (!snap.empty) {
      const rawUser = snap.docs[0].data() as User;
      const user = normalizeUser(rawUser);
      saveLocalUser(user);

      if (user.password !== password) {
        return { success: false, message: 'Senha incorreta' };
      }
      
      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }
      
      return { success: true, user };
    }
  } catch (error: any) {
    console.warn('Não foi possível conectar ao Firestore para login, verificando cache local:', error);
  }

  // Fallback to local user cache
  const localUser = localUsers.find(u => u.email === emailOrUsername || u.username === emailOrUsername);
  if (localUser) {
    const user = normalizeUser(localUser);
    if (user.password !== password) {
      return { success: false, message: 'Senha incorreta' };
    }
    if (!user.isApproved) {
      return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
    }
    return { success: true, user };
  }

  return { success: false, message: 'Usuário não encontrado' };
}

export async function getAllUsers(): Promise<User[]> {
  const localUsers = getLocalUsers();
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await withTimeout(getDocs(usersRef), 3000);
    const remoteUsers = snap.docs.map(doc => doc.data() as User);
    remoteUsers.forEach(saveLocalUser);
    return remoteUsers;
  } catch (error) {
    console.warn('Firestore offline ao buscar todos os usuários (usando cache local):', error);
    return localUsers;
  }
}

export async function updateUserAdminStatus(userId: string, updates: Partial<User>): Promise<boolean> {
  const localUsers = getLocalUsers();
  const found = localUsers.find(u => u.id === userId);
  if (found) {
    saveLocalUser({ ...found, ...updates });
  }

  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await withTimeout(updateDoc(userRef, updates), 3000);
    return true;
  } catch (error) {
    console.warn('Firestore offline ao atualizar usuário (atualizado localmente):', error);
    return true;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  const localUsers = getLocalUsers();
  const localUser = localUsers.find(u => u.id === userId) || null;

  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const snap = await withTimeout(getDoc(userRef), 3000);
    if (snap.exists()) {
      const user = snap.data() as User;
      saveLocalUser(user);
      return user;
    }
  } catch (error) {
    console.warn('Firestore offline ao buscar usuário por ID (usando local):', error);
  }

  return localUser;
}
