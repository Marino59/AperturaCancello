// src/PendingRequests.jsx

import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
// --- IMPORT AGGIUNTI (CON 'where' CORRETTO) ---
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  where // <-- ECCO LA CORREZIONE!
} from 'firebase/firestore';
// --------------------

const COLLECTION_LOGS = "gate_logs";

// Funzione per rifiutare
const handleReject = async (log) => {
  if (!window.confirm(`Sei sicuro di voler rifiutare la richiesta di "${log.telegram_nome || 'Utente Sconosciuto'}"?`)) {
    return;
  }
  
  try {
    const logRef = doc(db, COLLECTION_LOGS, log.id);
    await updateDoc(logRef, {
      status: 'processed_rejected',
      messaggio: 'Richiesta rifiutata manualmente.'
    });
  } catch (err) {
    console.error("Errore nel rifiutare la richiesta:", err);
    alert("Si è verificato un errore durante il rifiuto.");
  }
};

const PendingRequests = ({ onApprove }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    
    // Query: Carica solo i log con lo stato "failed_unauthorized"
    const requestsQuery = query(
      collection(db, COLLECTION_LOGS),
      where("status", "==", "failed_unauthorized"), 
      orderBy("timestamp", "desc") 
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const latestRequests = new Map();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data(); 
        const telegramId = data.telegram_id;
        
        if (!latestRequests.has(telegramId)) {
            latestRequests.set(telegramId, {
                id: doc.id,
                ...data
            });
        }
      });
      
      setRequests(Array.from(latestRequests.values()));
      setError(null); 
      setLoading(false);

    }, (err) => {
      console.error("Errore nel recupero richieste in attesa:", err);
      setError("Impossibile caricare le richieste. Controlla la console."); 
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <p>Caricamento richieste in attesa...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ padding: '10px' }}>
      <h3>Richieste Non Autorizzate ({requests.length})</h3>
      
      {requests.length === 0 ? (
        <p>Nessuna richiesta di accesso non autorizzata.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {requests.map((req) => (
            <div key={req.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', backgroundColor: '#fff8f9' }}>
              <p style={{ margin: 0, fontWeight: 'bold' }}>
                {`${req.telegram_nome || 'Utente Sconosciuto'} ${req.telegram_cognome || ''}`}
              </p>
              <p style={{ fontSize: '0.8em', color: '#666', margin: '5px 0' }}>
                ID: {req.telegram_id}
              </p>
              <p style={{ fontSize: '0.9em', margin: '5px 0' }}>
                Richiesta: *{req.testo_ricevuto}*
              </p>
              
              <button 
                onClick={() => onApprove(req)} 
                style={{ 
                  backgroundColor: '#28a745', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 15px', 
                  borderRadius: '4px', 
                  marginTop: '10px', 
                  cursor: 'pointer' 
                }}
              >
                Approva Accesso
              </button>
              
              <button 
                onClick={() => handleReject(req)} 
                style={{ 
                  backgroundColor: '#dc3545', // Rosso
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 15px', 
                  borderRadius: '4px', 
                  marginTop: '10px', 
                  marginLeft: '10px', // Spazio tra i bottoni
                  cursor: 'pointer' 
                }}
              >
                Rifiuta
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingRequests;