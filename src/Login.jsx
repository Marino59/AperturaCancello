// src/Login.jsx

import React from 'react';
import { auth, googleProvider } from './firebaseConfig';
import { signInWithPopup } from 'firebase/auth';

const Login = () => {

  const handleGoogleLogin = async () => {
    try {
      // Avvia il popup di login di Google
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged in main.jsx rileverà il login
      // e mostrerà automaticamente <App />
    } catch (error) {
      console.error("Errore durante il login con Google:", error);
      alert("Si è verificato un errore durante il login. Riprova.");
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      <h1>Admin Cancello</h1>
      <p>Devi effettuare l'accesso per continuare.</p>
      <button onClick={handleGoogleLogin}>
        Accedi con Google
      </button>
    </div>
  );
};

export default Login;