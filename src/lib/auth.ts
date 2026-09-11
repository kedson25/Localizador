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
    console.error('Não foi possível cadastrar no Firestore:', error);
    return { success: false, message: 'Não foi possível conectar ao banco de dados.' };
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

      if (user.password !== password) {
        return { success: false, message: 'Senha incorreta' };
      }
      
      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }
      
      return { success: true, user };
    }
  } catch (error: any) {
    console.error('Não foi possível conectar ao Firestore para login:', error);
  }

  return { success: false, message: 'Não foi possível autenticar no banco de dados.' };
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await withTimeout(getDocs(usersRef), 3000);
    const remoteUsers = snap.docs.map(doc => doc.data() as User);
    return remoteUsers;
  } catch (error) {
    console.error('Erro ao buscar usuários no Firestore:', error);
    return [];
  }
}

export async function updateUserAdminStatus(userId: string, updates: Partial<User>): Promise<boolean> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await withTimeout(updateDoc(userRef, updates), 3000);
    return true;
  } catch (error) {
    console.error('Não foi possível atualizar usuário no Firestore:', error);
    return false;
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const snap = await withTimeout(getDoc(userRef), 3000);
    return snap.exists() ? normalizeUser(snap.data() as User) : null;
  } catch (error) {
    console.error('Não foi possível buscar usuário no Firestore:', error);
    return null;
  }
}
