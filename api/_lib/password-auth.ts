const firebaseWebApiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;

export async function verifyEmailPassword(email: string, secret: string): Promise<string> {
  if (!firebaseWebApiKey) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }

  const endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(firebaseWebApiKey);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: secret, returnSecureToken: true }),
  });

  const data: any = await response.json();
  if (!response.ok || !data?.idToken) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return data.idToken;
}
