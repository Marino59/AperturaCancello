// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // <-- Ecco la correzione

// TODO: Sostituisci questo con la configurazione del tuo progetto Firebase!
const firebaseConfig = {
  apiKey: "AIzaSyCF0cMXVCfs6wc8HJm7EUnbRxz1AihgbgE",
  authDomain: "telecomando-37c26.firebaseapp.com",
  projectId: "telecomando-37c26",
  storageBucket: "telecomando-37c26.firebasestorage.app",
  messagingSenderId: "235981155039",
  appId: "1:235981155039:web:ae556add6b24141436d76a"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);

// Esporta i servizi che useremo
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export default app;