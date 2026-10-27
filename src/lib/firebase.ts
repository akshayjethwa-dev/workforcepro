// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const DEFAULT_CONFIG = {
  apiKey: "AIzaSyDnVAArL8pWZf4FO1s_Rr0t2-odJHBRNmw",
  authDomain: "workforcepro-saas.firebaseapp.com",
  projectId: "workforcepro-saas",
  storageBucket: "workforcepro-saas.firebasestorage.app",
  messagingSenderId: "555067537482",
  appId: "1:555067537482:web:c2cab9b1a9d4291e7e4eb3"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      // Pass an empty object to satisfy the TypeScript definition
      tabManager: persistentSingleTabManager({}) 
    })
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const storage = getStorage(app);