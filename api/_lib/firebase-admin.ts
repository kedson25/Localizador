import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'ecooy-5b791';

export function getFirebaseAdmin(): {
  db: Firestore;
  auth: Auth;
  FieldValue: typeof FieldValue;
} {
  if (!app) {
    const existingApps = getApps();

    if (existingApps.length > 0) {
      app = existingApps[0];
    } else {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

      let credential = applicationDefault();

      if (clientEmail && privateKeyRaw) {
        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

        credential = cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail,
          privateKey,
        });
      }

      try {
        app = initializeApp({
          credential,
          projectId: FIREBASE_PROJECT_ID,
        });
      } catch (err: any) {
        const apps = getApps();

        if (apps.length > 0) {
          app = apps[0];
        } else {
          console.error('[Firebase Admin] Erro ao inicializar App:', {
            projectId: FIREBASE_PROJECT_ID,
            message: err?.message || String(err),
          });
          throw err;
        }
      }
    }

    db = getFirestore(app);

    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (_) {}

    auth = getAuth(app);
  }

  return {
    db: db!,
    auth: auth!,
    FieldValue,
  };
}

export { FieldValue };

export const adminDb = {
  get db() {
    return getFirebaseAdmin().db;
  },
  get auth() {
    return getFirebaseAdmin().auth;
  },
  get FieldValue() {
    return FieldValue;
  },
};
