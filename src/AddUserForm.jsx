// src/AddUserForm.jsx

import React, { useState, useEffect } from 'react'; // AGGIUNTO useEffect
import { db } from './firebaseConfig';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore'; // AGGIUNTO updateDoc, doc

// Funzione helper per creare un oggetto Date da una stringa 'YYYY-MM-DD'
// Usiamo UTC per garantire che la data sia corretta indipendentemente dal fuso orario locale del client.
const createUtcDate = (dateString) => {
  if (!dateString) return null;
  const parts = dateString.split('-');
  // new Date(year, monthIndex, day) - monthIndex è 0-based
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
};

// Accetta la prop opzionale chiamata initialRequest
const AddUserForm = ({ onUserAdded, initialRequest }) => { // AGGIUNTA initialRequest
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    codice_telegram: '',
    data_inizio: '', // Stringa 'YYYY-MM-DD'
    data_fine: '',   // Stringa 'YYYY-MM-DD'
    garage: '',
    gruppo: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- LOGICA AGGIUNTA: Pre-compilazione da initialRequest ---
  useEffect(() => {
    if (initialRequest) {
      // Inizializza il form con i dati della richiesta pendente
      setFormData((prevData) => ({
        ...prevData,
        // Usiamo i dati della richiesta pendente
        nome: initialRequest.telegram_nome || '',
        cognome: initialRequest.telegram_cognome || '',
        codice_telegram: initialRequest.telegram_id || '', // ECCO L'ID TELEGRAM!
      }));
    }
  }, [initialRequest]); // Riscattiva quando initialRequest cambia
  // -------------------------------------------------------------

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // --- CONTROLLO CAMPI OBBLIGATORI ---
    if (!formData.nome.trim() || !formData.data_inizio.trim()) {
      setError('Nome e Data Inizio sono obbligatori.');
      return; 
    }
    // Controlliamo che l'ID Telegram sia presente (essenziale per l'autorizzazione)
    if (!formData.codice_telegram.trim()) {
        setError('L\'ID Telegram è obbligatorio per l\'autorizzazione.');
        return;
    }
    // ------------------------------------
    
    setLoading(true);
    setError('');

    try {
      // Prepara i dati da salvare
      const dataToSave = {
        nome: formData.nome.trim(),
        cognome: formData.cognome.trim(),
        codice_telegram: formData.codice_telegram.trim(),
        garage: formData.garage.trim(),
        gruppo: formData.gruppo.trim(),
        note: formData.note.trim(),
        
        creato_il: serverTimestamp(),
        
        // Conversione delle date in oggetti Date UTC per Firestore
        data_inizio: createUtcDate(formData.data_inizio.trim()),
      };

      // Aggiungi data_fine solo se è stata inserita (convertita in oggetto Date)
      const dataFineDate = createUtcDate(formData.data_fine.trim());
      if (dataFineDate) {
        dataToSave.data_fine = dataFineDate;
      }

      // 1. Aggiungi l'utente autorizzato
      await addDoc(collection(db, 'authorized_users'), dataToSave);
      
      // 2. Se è una richiesta in attesa, aggiorna il log come processato
      if (initialRequest && initialRequest.id) {
        const logRef = doc(db, 'gate_logs', initialRequest.id);
        await updateDoc(logRef, {
            status: 'processed_approved',
            messaggio: 'Richiesta approvata manualmente.'
        });
      }
      
      // Resetta il form
      setFormData({
        nome: '',
        cognome: '',
        codice_telegram: '',
        data_inizio: '',
        data_fine: '',
        garage: '',
        gruppo: '',
        note: '',
      });
      
      // Chiama la funzione onUserAdded
      if (onUserAdded) {
        onUserAdded(); 
      }
    } catch (err) {
      console.error("Errore nell'aggiungere l'utente:", err);
      setError(`Errore nell'aggiungere l'utente: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="addUserForm">
      <h3>{initialRequest ? 'Approva Richiesta Utente' : 'Aggiungi Nuovo Utente'}</h3>
      
      {initialRequest && (
        <div style={{ 
          backgroundColor: '#fff0f1', 
          borderLeft: '4px solid #dc3545', 
          borderRadius: '6px', 
          padding: '14px 18px', 
          marginBottom: '20px',
          color: '#2d3748',
          fontSize: '0.95rem',
          boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#dc3545', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📌 DATI RICHIESTA TELEGRAM DI ORIGINE
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ minWidth: '160px', color: '#718096' }}>👤 Nome/Cognome Profilo:</span>
              <strong style={{ color: '#1a202c' }}>{initialRequest.telegram_nome || 'N/D'} {initialRequest.telegram_cognome || ''}</strong>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ minWidth: '160px', color: '#718096' }}>🤖 Telegram ID:</span>
              <strong style={{ color: '#1a202c', fontFamily: 'monospace' }}>{initialRequest.telegram_id || 'N/D'}</strong>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', marginTop: '4px', borderTop: '1px dashed rgba(220, 53, 69, 0.15)', paddingTop: '6px' }}>
              <span style={{ color: '#718096', fontWeight: '500' }}>💬 Messaggio inviato:</span>
              <span style={{ fontStyle: 'italic', fontWeight: '600', color: '#2d3748', fontSize: '1rem', backgroundColor: 'rgba(255,255,255,0.6)', padding: '6px 10px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
                "{initialRequest.testo_ricevuto || 'Nessun messaggio'}"
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* --- Riga 1: Nome e Cognome --- */}
      <div className="formRow">
        <div className="formGroup">
          <label htmlFor="add-nome">Nome *</label>
          <input
            id="add-nome"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
            placeholder="Nome (es. Mario)"
            required
          />
        </div>
        <div className="formGroup">
          <label htmlFor="add-cognome">Cognome</label>
          <input
            id="add-cognome"
            name="cognome"
            value={formData.cognome}
            onChange={handleChange}
            placeholder="Cognome (es. Rossi)"
          />
        </div>
      </div>

      {/* --- Riga 2: ID Telegram --- */}
      <div className="formRow">
        <div className="formGroup fullWidth">
          <label htmlFor="add-codice_telegram">ID Telegram *</label>
          <input
            id="add-codice_telegram"
            name="codice_telegram"
            value={formData.codice_telegram}
            onChange={handleChange}
            placeholder="ID numerico di Telegram (Obbligatorio)"
            required
            // DISABILITA SE PRE-COMPILATO
            disabled={!!initialRequest} 
            style={initialRequest ? { backgroundColor: '#f0f0f0' } : {}}
          />
        </div>
      </div>

      {/* --- Riga 3: Date --- */}
      <div className="formRow">
        <div className="formGroup">
          <label htmlFor="add-data_inizio">Data Inizio *</label>
          <input
            id="add-data_inizio"
            name="data_inizio"
            type="date"
            value={formData.data_inizio}
            onChange={handleChange}
            required
          />
        </div>
        <div className="formGroup">
          <label htmlFor="add-data_fine">Data Fine</label>
          <input
            id="add-data_fine"
            name="data_fine"
            type="date"
            value={formData.data_fine}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* --- Riga 4: Garage e Gruppo --- */}
      <div className="formRow">
        <div className="formGroup">
          <label htmlFor="add-garage">Garage</label>
          <input
            id="add-garage"
            name="garage"
            value={formData.garage}
            onChange={handleChange}
            placeholder="Garage (es. 1, 2)"
          />
        </div>
        <div className="formGroup">
          <label htmlFor="add-gruppo">Gruppo</label>
          <input
            id="add-gruppo"
            name="gruppo"
            value={formData.gruppo}
            onChange={handleChange}
            placeholder="Gruppo (es. Famiglia)"
          />
        </div>
      </div>

      {/* --- Riga 5: Note --- */}
      <div className="formRow">
        <div className="formGroup fullWidth">
          <label htmlFor="add-note">Note</label>
          <input
            id="add-note"
            name="note"
            value={formData.note}
            onChange={handleChange}
            placeholder="Note..."
          />
        </div>
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Aggiungo...' : (initialRequest ? 'Conferma e Autorizza' : 'Aggiungi Utente')}
      </button>
      {error && <p className="error-message">{error}</p>}
    </form>
  );
};

export default AddUserForm;