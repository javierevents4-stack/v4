import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAOGDqjKHDZ9T_4stYWN2aW2I4shcJRQEg',
  authDomain: 'wild-pictures-studio-contratos.firebaseapp.com',
  projectId: 'wild-pictures-studio-contratos',
  storageBucket: 'wild-pictures-studio-contratos.firebasestorage.app',
  messagingSenderId: '1045086853975',
  appId: '1:1045086853975:web:70e0a13ceeb2485cd13c12'
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });
export const auth = getAuth(app);
export const storage = getStorage(app, 'gs://wild-pictures-studio-contratos.firebasestorage.app');

export default app;
