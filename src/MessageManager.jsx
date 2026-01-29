// src/MessageManager.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, setDoc, deleteDoc, collection } from 'firebase/firestore'; // Aggiunto deleteDoc

const COLLECTION_MESSAGES = "message_templates";

// --- MODIFICATO: Rimosso 'system_offline' ---
const MESSAGE_TEMPLATES = {
  auth_success: {
    description: "Risposta per un'apertura (cancello/garage) riuscita.",
    defaultText: "Ciao {nome}, {tipo_apertura} aperto!" 
  },
  auth_denied: {
    description: "Risposta a un utente non autorizzato (che si deve identificare).",
    defaultText: "Accesso negato, non sei autorizzato.\n\nPer richiedere l'accesso, invia un NUOVO messaggio con il tuo Nome, Cognome e una breve descrizione (es. 'Sono Mario Rossi, appartamento 12').\n\nL'amministratore vedrà la tua richiesta."
  },
  auth_expired: {
    description: "Risposta per un utente con autorizzazione scaduta.",
    defaultText: "Accesso negato. La tua autorizzazione è scaduta o non ancora attiva."
  },
  welcome_new_user: {
    description: "Messaggio inviato la prima volta che un utente viene autorizzato.",
    defaultText: "Ciao {nome}, sei stato autorizzato.\n\nAdesso qualsiasi cosa mi scriverai il cancello si aprirà e poi si chiuderà automaticamente dopo un minuto (circa)."
  }
  // 'system_offline' è stato Rimosso
};

// Stili (invariati)
const formStyle = { display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9', color: '#333' };
const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '0.5rem' };
const labelStyle = { fontWeight: 'bold', fontSize: '1.1em' };
const descriptionStyle = { fontSize: '0.9em', color: '#555', fontStyle: 'italic', marginTop: '-0.25rem' };
const textareaStyle = { width: '100%', minHeight: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'inherit', fontSize: '1em' };
const buttonStyle = { padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1em', maxWidth: '200px' };

const MessageManager = () => {
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // 1. Funzione per caricare e inizializzare i template
  const initializeTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    const loadedMessages = {};

    try {
      const messageKeys = Object.keys(MESSAGE_TEMPLATES);
      
      for (const key of messageKeys) {
        const docRef = doc(db, COLLECTION_MESSAGES, key);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          loadedMessages[key] = docSnap.data().text;
        } else {
          const defaultText = MESSAGE_TEMPLATES[key].defaultText;
          await setDoc(docRef, { text: defaultText });
          loadedMessages[key] = defaultText;
          console.log(`Template '${key}' non trovato, creato con testo di default.`);
        }
      }
      setMessages(loadedMessages);
      
      // --- NUOVO: Pulizia template obsoleto ---
      // Ora che abbiamo caricato quelli giusti, cancelliamo 'system_offline' se esiste
      try {
        const oldDocRef = doc(db, COLLECTION_MESSAGES, 'system_offline');
        const oldDocSnap = await getDoc(oldDocRef);
        if (oldDocSnap.exists()) {
          await deleteDoc(oldDocRef);
          console.log("Template obsoleto 'system_offline' eliminato.");
        }
      } catch (deleteErr) {
        console.warn("Errore durante l'eliminazione del template obsoleto:", deleteErr);
      }
      // --- FINE PULIZIA ---
      
    } catch (err) {
      console.error("Errore durante l'inizializzazione dei template:", err);
      setError("Impossibile caricare o creare i template dei messaggi. Controlla la console.");
    }
    setLoading(false);
  }, []);

  // 2. Carica i template al montaggio del componente
  useEffect(() => {
    initializeTemplates();
  }, [initializeTemplates]);

  // 3. Gestisce la modifica del testo in uno dei campi
  const handleTextChange = (key, value) => {
    setMessages(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 4. Salva TUTTI i messaggi su Firebase
  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const messageKeys = Object.keys(messages);
      for (const key of messageKeys) {
        const docRef = doc(db, COLLECTION_MESSAGES, key);
        await setDoc(docRef, { text: messages[key] }, { merge: true });
      }
      setSuccess("Messaggi aggiornati con successo!");
    } catch (err) {
      console.error("Errore during il salvataggio dei messaggi:", err);
      setError("Impossibile salvare i messaggi. Riprova.");
    }
    setLoading(false);
  };
  

  if (loading && Object.keys(messages).length === 0) {
    return <p>Caricamento e inizializzazione template messaggi...</p>;
  }

  return (
    <div>
      <h3>Gestione Messaggi Bot</h3>
      <p>Modifica i testi che il bot invia su Telegram. Le variabili come {'{nome}'} verranno sostituite automaticamente.</p>
      
      <div style={formStyle}>
        {Object.keys(MESSAGE_TEMPLATES).map(key => (
          <div key={key} style={inputGroupStyle}>
            
            {/* --- MODIFICA: Mostra la descrizione come titolo, non la chiave --- */}
            <label style={labelStyle}>{MESSAGE_TEMPLATES[key].description}</label>
            {/* --- RIMOSSA: <p> con la descrizione (ora è ridondante) --- */}
            
            <textarea
              style={textareaStyle}
              value={messages[key] || ''}
              onChange={(e) => handleTextChange(key, e.target.value)}
              disabled={loading}
            />
          </div>
        ))}

        <button 
          style={{ ...buttonStyle, backgroundColor: loading ? '#ccc' : '#007bff' }} 
          onClick={handleSave} 
          disabled={loading}
        >
          {loading ? 'Salvataggio...' : 'Salva Tutti i Messaggi'}
        </button>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
      </div>
    </div>
  );
};

export default MessageManager;