import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { workerData } from 'node:worker_threads';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Integration tests require a local Firestore emulator. Production is never used.');
}
const [hostname, port] = host.split(':');
const app = initializeApp({ projectId: 'demo-localizador', apiKey: 'emulator-only', appId: 'emulator-only' }, workerData?.name || 'observer');
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, hostname, Number(port), {
  mockUserToken: { sub: workerData?.name || 'observer', user_id: workerData?.name || 'observer' },
});

export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test Firebase timeout')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function validateAndCleanIds(ids: string[]): string[] {
  return [...new Set(ids.map(id => id.trim().replace(/[mM]$/, '')).filter(Boolean))];
}
