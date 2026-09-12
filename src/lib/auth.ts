import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from './firebase';
import { supabase } from './supabase';

export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isApproved: boolean;
  allowedGroups: string[];
}

interface ProfileRow {
  firebase_uid: string;
  username: string;
  email: string;
  is_admin: boolean;
  is_approved: boolean;
  allowed_groups: string[];
}

const PROFILE_COLUMNS = 'firebase_uid,username,email,is_admin,is_approved,allowed_groups';
const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
const ensureSession = httpsCallable<{ username?: string }, { claimsChanged: boolean }>(functions, 'ensureFirebaseSession');
const usernameLogin = httpsCallable<{ username: string; password: string }, { token: string }>(functions, 'loginWithUsername');
const changePermissions = httpsCallable<{
  userId: string;
  updates: Pick<Partial<User>, 'isAdmin' | 'isApproved' | 'allowedGroups'>;
}, { success: boolean }>(functions, 'updateUserPermissions');

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

export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  if (code === 'auth/network-request-failed' || code === 'functions/unavailable') return 'Sem conexão com o serviço de autenticação. Tente novamente.';
  if (code === 'functions/deadline-exceeded' || code === 'auth/timeout') return 'O serviço de autenticação demorou para responder. Tente novamente.';
  if (code === 'functions/not-found' || code === 'functions/internal') return 'A integração entre Firebase e Supabase ainda não está disponível. Publique as Cloud Functions do projeto Firebase.';
  if (code === 'auth/too-many-requests' || code === 'functions/resource-exhausted') return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'functions/unauthenticated'].includes(code)) return 'Usuário/e-mail ou senha inválidos.';
  if (code === 'auth/email-already-in-use') return 'E-mail já cadastrado. Faça login para continuar.';
  if (code === 'auth/weak-password') return 'A senha precisa ter pelo menos 6 caracteres.';
  if (code === 'auth/invalid-email') return 'Informe um e-mail válido.';
  if (code === 'auth/user-disabled') return 'Esta conta está desativada. Entre em contato com um administrador.';
  if (code === '42501' || code === 'functions/permission-denied') return 'Você não tem permissão para realizar esta operação.';
  if (code.startsWith('functions/') && error instanceof Error && error.message !== 'INTERNAL') return error.message;
  if (error instanceof Error && !code) return error.message;
  return 'Não foi possível concluir a autenticação. Verifique a conexão e a configuração do serviço.';
}

function fromProfile(row: ProfileRow): User {
  return { id: row.firebase_uid, username: row.username, email: row.email, isAdmin: row.is_admin, isApproved: row.is_approved, allowedGroups: row.allowed_groups || [] };
}

export function normalizeUser(user: User): User {
  return { ...user, allowedGroups: Array.isArray(user.allowedGroups) ? [...user.allowedGroups] : [] };
}

async function prepareSession(firebaseUser: FirebaseUser, username?: string): Promise<void> {
  const result = await ensureSession(username ? { username } : {});
  await firebaseUser.getIdToken(result.data.claimsChanged);
}

export async function signupUser(username: string, email: string, password: string): Promise<{ success: boolean; message?: string }> {
  return runInteractiveAuth(async () => {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim();
    let firebaseUser: FirebaseUser | null = null;
    let existingFirebaseAccount = false;
    try {
      try {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        firebaseUser = credential.user;
      } catch (error) {
        if (authErrorCode(error) !== 'auth/email-already-in-use') throw error;

        existingFirebaseAccount = true;
        try {
          const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
          firebaseUser = credential.user;
        } catch (loginError) {
          if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(authErrorCode(loginError))) {
            return {
              success: false,
              message: 'Este e-mail já existe no Firebase. Informe a senha atual dessa conta para vinculá-la ao sistema.',
            };
          }
          throw loginError;
        }
      }

      if (!existingFirebaseAccount || !firebaseUser.displayName) {
        await updateProfile(firebaseUser, { displayName: normalizedUsername });
      }
      await prepareSession(firebaseUser, normalizedUsername);
      return {
        success: true,
        message: existingFirebaseAccount
          ? 'Conta Firebase vinculada ao sistema! Aguarde a aprovação de um Administrador.'
          : 'Cadastro realizado! Aguarde a aprovação de um Administrador.',
      };
    } catch (error) {
      // A partially completed signup can safely be resumed by logging in with its email.
      const resume = firebaseUser && !existingFirebaseAccount
        ? ' Sua conta Firebase foi criada; repita o cadastro com o mesmo e-mail e senha para concluir a vinculação.'
        : '';
      return { success: false, message: authErrorMessage(error) + resume };
    } finally {
      if (firebaseUser) await signOut(auth);
    }
  });
}

export async function loginUser(emailOrUsername: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> {
  return runInteractiveAuth(async () => {
    try {
      const login = emailOrUsername.trim();
      const credential = login.includes('@')
        ? await signInWithEmailAndPassword(auth, login, password)
        : await signInWithCustomToken(auth, (await usernameLogin({ username: login, password })).data.token);
      await prepareSession(credential.user);
      const user = await getUserById(credential.user.uid);
      if (!user) throw new Error('Perfil não encontrado. Solicite a um administrador a conclusão do cadastro.');
      if (!user.isApproved) {
        await signOut(auth);
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }
      return { success: true, user };
    } catch (error) {
      await signOut(auth);
      return { success: false, message: authErrorMessage(error) };
    }
  });
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('firebase_uid', userId).maybeSingle();
  if (error) throw new Error(authErrorMessage(error));
  return data ? fromProfile(data as ProfileRow) : null;
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase.rpc('list_visible_profiles', {});
  if (error) throw new Error(authErrorMessage(error));
  return (data as ProfileRow[]).map(fromProfile);
}

export async function updateUserAdminStatus(userId: string, updates: Partial<User>): Promise<boolean> {
  const { data } = await changePermissions({ userId, updates: {
    ...(updates.isAdmin !== undefined ? { isAdmin: updates.isAdmin } : {}),
    ...(updates.isApproved !== undefined ? { isApproved: updates.isApproved } : {}),
    ...(updates.allowedGroups !== undefined ? { allowedGroups: updates.allowedGroups } : {}),
  } });
  return data.success;
}

/** Firebase owns the session; profile permissions always come from the server. */
export function subscribeAuthSession(onChange: (user: User | null) => void, onError: (message: string) => void): () => void {
  let disposed = false;
  let generation = 0;
  let profileChannel: ReturnType<typeof supabase.channel> | null = null;
  let permissionTimer: ReturnType<typeof setInterval> | null = null;
  const clearProfileListener = () => {
    if (profileChannel) void supabase.removeChannel(profileChannel);
    profileChannel = null;
    if (permissionTimer) clearInterval(permissionTimer);
    permissionTimer = null;
  };
  const stop = onAuthStateChanged(auth, firebaseUser => {
    const thisGeneration = ++generation;
    clearProfileListener();
    void (async () => {
      if (interactiveAuth) await interactiveAuth;
      if (disposed || generation !== thisGeneration || auth.currentUser?.uid !== firebaseUser?.uid) return;
      if (!firebaseUser) { onChange(null); return; }
      const isCurrent = () => !disposed && generation === thisGeneration && auth.currentUser?.uid === firebaseUser.uid;
      const refreshProfile = async () => {
        try {
          const profile = await getUserById(firebaseUser.uid);
          if (!isCurrent()) return;
          onChange(profile?.isApproved ? profile : null);
          if (!profile?.isApproved) {
            onError('Acesso pendente de aprovação por um Administrador.');
            await signOut(auth);
          }
        } catch (error) {
          if (isCurrent()) { onChange(null); onError(authErrorMessage(error)); }
        }
      };
      try {
        await prepareSession(firebaseUser);
        if (!isCurrent()) return;
        profileChannel = supabase.channel(`profile-permissions:${firebaseUser.uid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `firebase_uid=eq.${firebaseUser.uid}` }, () => { void refreshProfile(); })
          .subscribe();
        await refreshProfile();
        if (isCurrent()) permissionTimer = setInterval(() => { void refreshProfile(); }, 60_000);
      } catch (error) {
        if (isCurrent()) { onChange(null); onError(authErrorMessage(error)); }
      }
    })();
  }, error => { if (!disposed) { onChange(null); onError(authErrorMessage(error)); } });
  return () => { disposed = true; generation += 1; stop(); clearProfileListener(); };
}
