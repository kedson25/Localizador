import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  type Firestore,
  type DocumentData
} from 'firebase/firestore';

export interface FirestoreWrite {
  path: string[];
  mode: 'set' | 'delete';
  data?: DocumentData;
}

export interface FirestoreWriteCondition {
  path: string[];
  allowMissing?: boolean;
  field: string;
  equals: unknown;
}

export type FirestoreTransport = (
  writes: FirestoreWrite[],
  condition?: FirestoreWriteCondition
) => Promise<boolean>;

export function createFirestoreTransport(database: Firestore): FirestoreTransport {
  return async (writes, condition) => {
    if (condition) {
      const current = await getDoc(doc(database, condition.path.join('/')));
      if (!current.exists()) return condition.allowMissing === true;
      if (current.data()[condition.field] !== condition.equals) return false;
    }

    for (const write of writes) {
      const reference = doc(database, write.path.join('/'));
      if (write.mode === 'delete') await deleteDoc(reference);
      else await setDoc(reference, write.data || {}, { merge: true });
    }
    return true;
  };
}
