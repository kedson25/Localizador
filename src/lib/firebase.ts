import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Public Firebase configuration. Firebase manages identity only.
const firebaseConfig = {
  apiKey: 'AIzaSyCfpBmn3cdKP9vaGrDzKCB7oRPMSMx02tA',
  authDomain: 'ecooy-5b791.firebaseapp.com',
  databaseURL: 'https://ecooy-5b791-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ecooy-5b791',
  storageBucket: 'ecooy-5b791.firebasestorage.app',
  messagingSenderId: '824859587278',
  appId: '1:824859587278:web:9a6b5a4485af41e70dd69f',
  measurementId: 'G-LDCXYXPEXF',
};
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
