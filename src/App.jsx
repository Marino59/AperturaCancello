// src/App.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc,
  serverTimestamp 
} from 'firebase/firestore';

// Importazioni MUI per l'AppBar
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import HomeIcon from '@mui/icons-material/Home';

// Importazioni dei componenti di pagina
import Home from './Home.jsx';
import UserTable from './UserTable.jsx';
import AddUserForm from './AddUserForm.jsx';
import LogTable from './LogTable.jsx';
import GarageManager from './GarageManager.jsx';
import PendingRequests from './PendingRequests.jsx';
import MessageManager from './MessageManager.jsx';
import BroadcastManager from './BroadcastManager.jsx';
import TimeManager from './TimeManager.jsx';
import HolidayManager from './HolidayManager.jsx';
import Login from './Login.jsx'; 
import './App.css'; // Importa gli stili globali

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  
  const [view, setView] = useState('home'); 
  const [pendingApprovalUser, setPendingApprovalUser] = useState(null);
  const [pendingKey, setPendingKey] = useState(0); 

  // Carica la lista degli amministratori all'avvio
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admin_users'), (snapshot) => {
      const admins = snapshot.docs.map(doc => doc.data().email);
      setAdminUsers(admins);
    });
    return () => unsub();
  }, []);

  // Controlla lo stato di autenticazione
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        if (adminUsers.length > 0) {
          setAuthorized(adminUsers.includes(currentUser.email));
        }
      } else {
        setUser(null);
        setAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [adminUsers]); 

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('home'); 
    } catch (error) {
      console.error("Errore during il logout:", error);
    }
  };

  // Funzione chiamata da PendingRequests
  const handleApproveUser = (logData) => {
    // --- CORREZIONE: Passiamo direttamente l'oggetto logData ---
    // logData contiene già le chiavi corrette (telegram_id, telegram_nome, ecc.)
    setPendingApprovalUser(logData); 
    setView('approve'); // Cambia vista per mostrare AddUserForm
  };

  // Funzione chiamata da AddUserForm quando finisce l'approvazione (rinominata per chiarezza)
  const handleUserAdded = () => {
    setPendingApprovalUser(null);
    setPendingKey(prevKey => prevKey + 1); // Forza il rerender di PendingRequests
    setView('pending'); // Torna alla lista delle richieste
  };
  
  // --- FUNZIONI PER I WIDGET ---
  const handleSendBroadcast = async (broadcastData) => {
    try {
      await addDoc(collection(db, 'pending_broadcasts'), {
        ...broadcastData,
        status: 'pending',
        creato_il: serverTimestamp(),
      });
      alert('Broadcast inviato con successo!');
      setView('home'); // Torna alla home
    } catch (error) {
      console.error('Errore invio broadcast:', error);
      alert(`Errore invio broadcast: ${error.message}`);
    }
  };

  const handleSaveSchedule = async (scheduleData) => {
    try {
      const scheduleRef = doc(db, 'timer_settings', 'schedule');
      await setDoc(scheduleRef, scheduleData, { merge: true });
      alert('Orari salvati con successo!');
      setView('home'); // Torna alla home
    } catch (error) {
      console.error('Errore salvataggio orari:', error);
      alert(`Errore salvataggio orari: ${error.message}`);
    }
  };

  const handleSaveHolidays = async (holiday) => {
    try {
      // Logica semplificata, gestita da HolidayManager
      await addDoc(collection(db, 'holidays'), holiday);
      alert('Festività salvata!');
      // Non torniamo alla home, l'utente potrebbe volerne aggiungere altre
    } catch (error) {
      alert(`Errore salvataggio festività: ${error.message}`);
    }
  };

  const handleAddGarage = async (garageData) => {
    try {
      const garageRef = doc(db, 'garage_mapping', garageData.garage_id);
      await setDoc(garageRef, garageData);
      alert('Garage aggiunto/modificato!');
      // Non torniamo alla home, l'utente potrebbe volerne aggiungere altri
    } catch (error) {
      console.error('Errore aggiunta garage:', error);
      alert(`Errore aggiunta garage: ${error.message}`);
    }
  };
  
  const handleRemoveGarage = async (docId) => {
     try {
      await deleteDoc(doc(db, 'garage_mapping', docId));
      alert('Garage rimosso!');
    } catch (error) {
      console.error('Errore rimozione garage:', error);
      alert(`Errore rimozione garage: ${error.message}`);
    }
  };
  
  // Questa funzione non è usata dalla tua Home originale, ma la lasciamo
  const handleOpenGate = async () => {
    try {
      await addDoc(collection(db, 'admin_commands'), {
        command: 'open_gate',
        timestamp: serverTimestamp(),
        admin_email: user.email
      });
      alert('Comando di apertura inviato!');
    } catch (error) {
      console.error('Errore apertura cancello:', error);
      alert(`Errore apertura cancello: ${error.message}`);
    }
  };
  // --- FINE FUNZIONI ---

  // --- RENDER VISTE ---
  const renderView = () => {
    switch(view) {
      case 'home':
        return <Home setView={setView} />; 
      case 'pending':
        return <PendingRequests key={pendingKey} onApprove={handleApproveUser} />;
      case 'anagrafica':
        return <UserTable />; // Come da tua richiesta, solo la tabella
      case 'log':
        return <LogTable />;
      case 'garage':
        return <GarageManager onAddGarage={handleAddGarage} onRemoveGarage={handleRemoveGarage} />;
      case 'messaggi':
        return <MessageManager />;
      case 'broadcast':
        return <BroadcastManager onSendBroadcast={handleSendBroadcast} />;
      case 'timer_orari':
        return <TimeManager onSaveSchedule={handleSaveSchedule} />;
      case 'timer_festivi':
        return <HolidayManager onSaveHolidays={handleSaveHolidays} />;
      case 'approve':
        return (
          <div style={{ padding: '1rem', border: '2px solid #28a745', marginBottom: '2rem', borderRadius: '8px' }}>
            <h3 style={{color: '#28a745', marginTop: 0}}>Approva Nuovo Utente</h3>
            <p>Completare le informazioni per autorizzare l'accesso.</p>
            <AddUserForm 
                initialRequest={pendingApprovalUser} // <-- CORREZIONE PROP NAME
                onUserAdded={handleUserAdded} // <-- CORREZIONE PROP NAME (e funzione)
            />
          </div>
        );
      default:
        return <Home setView={setView} />;
    }
  };

  // --- RENDER PRINCIPALE ---
  if (loading) {
    return <div>Caricamento...</div>;
  }

  if (!user) {
    return <Login />;
  }

  if (!authorized) {
    return (
      <div className="unauthorized-container">
        <h1>Accesso Negato</h1>
        <p>Non sei autorizzato a visualizzare questa pagina.</p>
        <button onClick={handleLogout}>Logout</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="home"
            onClick={() => setView('home')}
            sx={{ mr: 2 }}
          >
            <HomeIcon />
          </IconButton>
          {/* --- MODIFICA QUI --- */}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Gestione cancello
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            Ciao, {user.displayName}
          </Typography>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <main className="app-main">
        {renderView()}
      </main>
    </div>
  );
};

export default App;