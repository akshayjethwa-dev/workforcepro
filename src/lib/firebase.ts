import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // PASTE YOUR CONFIG FROM FIREBASE CONSOLE HERE
  apiKey: "AIzaSyDqgA2dppKl5qBT5zl5fxWJVvt3cBJVEzE",
  authDomain: "workforcepro-saas.firebaseapp.com",
  projectId: "workforcepro-saas",
  storageBucket: "workforcepro-saas.firebasestorage.app",
  messagingSenderId: "555067537482",
  appId: "1:555067537482:web:febb8c50cc547ebf7e4eb3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);