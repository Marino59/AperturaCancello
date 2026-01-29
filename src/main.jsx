// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

import { auth } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import Login from './Login.jsx'; 

// --- NUOVE IMPORTAZIONI MUI ---
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
// ------------------------------

// Definiamo un tema (scuro, come la tua app)
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

const AuthWrapper = () => {
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); 

  if (loading) {
    return <div>Caricamento...</div>; 
  }

  if (user) {
    return <App currentUser={user} />;
  } else {
    return <Login />; 
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* --- AVVOLGIAMO L'APP CON IL TEMA --- */}
    <ThemeProvider theme={darkTheme}>
      <CssBaseline /> {/* Normalizza il CSS */}
      <AuthWrapper />
    </ThemeProvider>
    {/* --------------------------------- */}
  </React.StrictMode>,
)