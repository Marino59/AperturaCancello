// src/EditUserModal.jsx

import React, { useState } from 'react';
import { db } from './firebaseConfig';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

const COLLECTION_UTENTI = "authorized_users";

// Helper function: Converte Timestamp in stringa per input datetime-local (YYYY-MM-DDTHH:mm)
const timestampToDatetimeLocal = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  
  // Formato richiesto dall'input: YYYY-MM-DDTHH:mm
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

// Helper function: Converte la stringa del form in formato Date valido
const formatForValidation = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString);
}

const EditUserModal = ({ user, onClose }) => {
  // Stati per i campi del form
  const [nome, setNome] = useState(user.nome || '');
  const [cognome, setCognome] = useState(user.cognome || '');
  const [telegramId, setTelegramId] = useState(user.codice_telegram || '');
  
  // Gestione Date
  const [dataInizio, setDataInizio] = useState(timestampToDatetimeLocal(user.data_inizio));
  const [dataFine, setDataFine] = useState(timestampToDatetimeLocal(user.data_fine));
  
  const [garage, setGarage] = useState(user.garage || '');
  const [gruppo, setGruppo] = useState(user.gruppo || '');
  const [commento, setCommento] = useState(user.commento || user.note || ''); 

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validazione base
    if (!nome.trim() || !formatForValidation(dataInizio)) {
      setError('I campi Nome e Data Inizio sono obbligatori.');
      return;
    }
    
    setLoading(true);

    try {
      const userDocRef = doc(db, COLLECTION_UTENTI, user.id);

      // Conversione date stringa -> Timestamp Firebase
      const tsInizio = dataInizio ? Timestamp.fromDate(new Date(dataInizio)) : null;
      const tsFine = dataFine ? Timestamp.fromDate(new Date(dataFine)) : null;

      const updateData = {
        nome: nome.trim(),
        cognome: cognome.trim(),
        codice_telegram: telegramId.trim(),
        data_inizio: tsInizio,
        data_fine: tsFine,
        garage: garage.trim(),
        gruppo: gruppo.trim(),
        commento: commento.trim(),
      };
      
      await updateDoc(userDocRef, updateData);

      setLoading(false);
      onClose(); // Chiude il modal
      
    } catch (err) {
      console.error("Errore durante l'aggiornamento utente:", err);
      setError("Si è verificato un errore durante il salvataggio. Riprova.");
      setLoading(false);
    }
  };

  // Stili CSS-in-JS
  const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
    alignItems: 'center', zIndex: 1000,
  };

  const modalContentStyle = {
    backgroundColor: 'white', padding: '2rem', borderRadius: '8px',
    width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
    color: '#333', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  };
  
  const fieldStyle = { marginBottom: '15px', display: 'flex', flexDirection: 'column' };
  
  const labelStyle = { 
    marginBottom: '5px', fontWeight: 'bold', fontSize: '14px'
  };
  
  const inputStyle = { 
    padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '16px'
  };

  const textareaStyle = {
    ...inputStyle, minHeight: '80px', resize: 'vertical'
  };

  const btnContainerStyle = {
    marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'
  };

  const btnSaveStyle = {
    backgroundColor: '#28a745', color: 'white', border: 'none', 
    padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px'
  };

  const btnCancelStyle = {
    backgroundColor: '#6c757d', color: 'white', border: 'none', 
    padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px'
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Modifica Utente</h2>
        
        <form onSubmit={handleSubmit}>
          
          <div style={fieldStyle}>
            <label style={labelStyle}>Nome (*)</label> 
            <input style={inputStyle} type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          
          <div style={fieldStyle}>
            <label style={labelStyle}>Cognome</label>
            <input style={inputStyle} type="text" value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </div>
          
          <div style={fieldStyle}>
            <label style={labelStyle}>ID Telegram</label>
            <input style={inputStyle} type="text" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
          </div>
          
          <div style={fieldStyle}>
            <label style={labelStyle}>Data Inizio (*)</label>
            <input style={inputStyle} type="datetime-local" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} required />
          </div>
          
          {/* CORRETTO: Ora setta correttamente DataFine */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Data Fine</label>
            <input style={inputStyle} type="datetime-local" value={dataFine} onChange={(e) => setDataFine(e.target.value)} />
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{...fieldStyle, flex: 1}}>
                <label style={labelStyle}>Garage</label>
                <input style={inputStyle} type="text" value={garage} onChange={(e) => setGarage(e.target.value)} />
            </div>
            <div style={{...fieldStyle, flex: 1}}>
                <label style={labelStyle}>Gruppo</label>
                <input style={inputStyle} type="text" value={gruppo} onChange={(e) => setGruppo(e.target.value)} />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Commento</label>
            <textarea style={textareaStyle} value={commento} onChange={(e) => setCommento(e.target.value)} />
          </div>
          
          {error && <p style={{ color: '#dc3545', marginTop: '10px', fontWeight: 'bold' }}>{error}</p>}

          <div style={btnContainerStyle}>
            <button type="button" onClick={onClose} style={btnCancelStyle}>
                Annulla
            </button>
            <button type="submit" disabled={loading} style={btnSaveStyle}>
                {loading ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default EditUserModal;