import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createClient } from '@supabase/supabase-js';

initializeApp();
const firebaseAuth = getAuth();
const supabaseSecret = defineSecret('SUPABASE_SECRET_KEY');
const supabaseUrl = defineString('SUPABASE_URL', { default: 'https://uncspldfjqqaaszlglkp.supabase.co' });
const firebaseWebApiKey = defineString('FIREBASE_WEB_API_KEY', { default: 'AIzaSyCfpBmn3cdKP9vaGrDzKCB7oRPMSMx02tA' });
const options = { region: 'us-central1', secrets: [supabaseSecret], timeoutSeconds: 30, maxInstances: 10 };
const allowedGroups = new Set(['consulta', 'remover', 'reporte', 'listas', 'upload', 'refugo']);
const defaultGroups = ['consulta', 'remover', 'reporte', 'listas', 'upload'];
let database;
function getDatabase() {
  database ??= createClient(supabaseUrl.value(), supabaseSecret.value(), { auth: { persistSession: false, autoRefreshToken: false } });
  return database;
}
function inputString(value, label, maximum = 200) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) throw new HttpsError('invalid-argument', `${label} inválido.`);
  return value.trim();
}
function usernameValue(value) {
  const username = inputString(value, 'Nome de usuário', 80);
  if (username.length < 3 || /[@\x00-\x1F]/.test(username)) throw new HttpsError('invalid-argument', 'O usuário deve ter entre 3 e 80 caracteres e não pode conter @.');
  return username;
}
async function requireIdentity(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
  const user = await firebaseAuth.getUser(request.auth.uid);
  if (user.disabled || !user.email) throw new HttpsError('permission-denied', 'Esta conta não pode acessar o sistema.');
  return user;
}
async function requireAdmin(request) {
  const user = await requireIdentity(request);
  const { data, error } = await getDatabase().from('profiles').select('is_admin,is_approved').eq('firebase_uid', user.uid).maybeSingle();
  if (error) throw new HttpsError('unavailable', 'Não foi possível verificar as permissões.');
  if (!data?.is_admin || !data?.is_approved) throw new HttpsError('permission-denied', 'Apenas administradores aprovados podem alterar permissões.');
  return user;
}

// This callable is idempotent and accepts no approval/admin fields from the client.
export const ensureFirebaseSession = onCall(options, async request => {
  const user = await requireIdentity(request);
  const db = getDatabase();
  const { data: existing, error } = await db.from('profiles').select('firebase_uid,username').eq('firebase_uid', user.uid).maybeSingle();
  if (error) throw new HttpsError('unavailable', 'Não foi possível carregar seu perfil. Verifique a configuração do banco.');
  let username = existing?.username;
  if (!existing) {
    username = usernameValue(request.data?.username || user.displayName);
    const { error: insertError } = await db.from('profiles').insert({
      firebase_uid: user.uid,
      username,
      email: user.email,
      is_admin: false,
      is_approved: false,
      allowed_groups: defaultGroups,
    });
    if (insertError) {
      // Another request for this same Firebase account may already have finished.
      const { data: concurrent, error: lookupError } = await db.from('profiles').select('username').eq('firebase_uid', user.uid).maybeSingle();
      if (lookupError || !concurrent) {
        if (insertError.code === '23505') throw new HttpsError('already-exists', 'Nome de usuário já cadastrado. Solicite a um administrador a correção do seu nome de usuário.');
        throw new HttpsError('unavailable', 'Não foi possível concluir seu cadastro. Entre novamente com seu e-mail para tentar concluir.');
      }
      username = concurrent.username;
    }
  }
  if (!user.displayName) await firebaseAuth.updateUser(user.uid, { displayName: username });
  const claimsChanged = user.customClaims?.role !== 'authenticated';
  if (claimsChanged) await firebaseAuth.setCustomUserClaims(user.uid, { ...user.customClaims, role: 'authenticated' });
  return { claimsChanged };
});

// Never expose an email directory: passwords are verified by Firebase before
// returning a Firebase custom token. Credentials are never persisted or logged.
export const loginWithUsername = onCall(options, async request => {
  const username = usernameValue(request.data?.username);
  const password = request.data?.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 4096) throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.');
  const { data: profile, error } = await getDatabase().from('profiles').select('firebase_uid').ilike('username', username.replace(/[\\%_]/g, '\\$&')).maybeSingle();
  if (error) throw new HttpsError('unavailable', 'Não foi possível acessar o serviço de autenticação.');
  if (!profile) throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.');
  let user;
  try { user = await firebaseAuth.getUser(profile.firebase_uid); }
  catch { throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.'); }
  if (user.disabled || !user.email) throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.');
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseWebApiKey.value())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new HttpsError('unavailable', 'O Firebase não respondeu. Tente novamente.'); }
  const verified = await response.json();
  if (!response.ok || verified.localId !== user.uid || !verified.idToken) {
    if (String(verified.error?.message).includes('TOO_MANY_ATTEMPTS')) throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde alguns minutos.');
    throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.');
  }
  // Verify that the password exchange produced an ID token for our own project.
  const decoded = await firebaseAuth.verifyIdToken(verified.idToken, true);
  if (decoded.uid !== user.uid) throw new HttpsError('unauthenticated', 'Usuário/e-mail ou senha inválidos.');
  return { token: await firebaseAuth.createCustomToken(user.uid, { role: 'authenticated' }) };
});

export const updateUserPermissions = onCall(options, async request => {
  const admin = await requireAdmin(request);
  const userId = inputString(request.data?.userId, 'Usuário', 128);
  const input = request.data?.updates;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Permissões inválidas.');
  const updates = {};
  if (input.isAdmin !== undefined) {
    if (typeof input.isAdmin !== 'boolean') throw new HttpsError('invalid-argument', 'Permissão de administrador inválida.');
    updates.is_admin = input.isAdmin;
  }
  if (input.isApproved !== undefined) {
    if (typeof input.isApproved !== 'boolean') throw new HttpsError('invalid-argument', 'Aprovação inválida.');
    updates.is_approved = input.isApproved;
  }
  if (input.allowedGroups !== undefined) {
    if (!Array.isArray(input.allowedGroups) || input.allowedGroups.some(group => !allowedGroups.has(group))) throw new HttpsError('invalid-argument', 'Grupo de permissão inválido.');
    updates.allowed_groups = [...new Set(input.allowedGroups)];
  }
  if (Object.keys(updates).length === 0) throw new HttpsError('invalid-argument', 'Nenhuma permissão foi informada.');
  if (admin.uid === userId && (updates.is_admin === false || updates.is_approved === false)) throw new HttpsError('failed-precondition', 'Outro administrador deve remover sua aprovação ou acesso de administrador.');
  const { data, error } = await getDatabase().from('profiles').update(updates).eq('firebase_uid', userId).select('firebase_uid').maybeSingle();
  if (error) throw new HttpsError('unavailable', 'Não foi possível atualizar as permissões.');
  if (!data) throw new HttpsError('not-found', 'Usuário não encontrado.');
  return { success: true };
});
