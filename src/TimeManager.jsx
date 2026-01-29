// src/TimeManager.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION_TIMER = "timer_settings";
const DOCUMENT_ID = "schedule"; // Usiamo un unico documento per contenere tutti gli orari

// Stili
const cardStyle = { backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const inputGroupStyle = { marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' };
const labelStyle = { fontWeight: 'bold', minWidth: '150px' };
const inputStyle = { padding: '8px', fontSize: '1.2em', width: '120px', fontFamily: 'monospace' };
const buttonStyle = { padding: '12px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1.1em', fontWeight: 'bold' };

const TimeManager = () => {
  const [schedule, setSchedule] = useState({
    feriali_apertura: '08:00',
    feriali_chiusura: '18:00',
    sabato_apertura: '09:00',
    sabato_chiusura: '13:00',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // 1. Carica le impostazioni attuali da Firebase
  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    const docRef = doc(db, COLLECTION_TIMER, DOCUMENT_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Se il documento esiste, carica i dati
      setSchedule(docSnap.data());
    } else {
      // Se non esiste, crea un documento con i valori di default
      try {
        await setDoc(docRef, schedule);
        console.log("Documento 'schedule' creato con orari di default.");
      } catch (err) {
        console.error("Errore nella creazione dello schedule:", err);
        setError("Impossibile creare la configurazione orari.");
      }
    }
    setLoading(false);
  }, [schedule]); // 'schedule' è incluso per usarlo come default se non esiste

  // Carica gli orari al primo avvio
  useEffect(() => {
    loadSchedule();
    // Esegui solo al mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gestisce la modifica di un campo
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSchedule(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Salva le modifiche su Firebase
  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validazione semplice del formato HH:MM (opzionale ma consigliata)
    const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/;
    for (const key in schedule) {
      if (!timeRegex.test(schedule[key])) {
        setError(`Formato ora non valido per ${key}. Usa HH:MM (es. 08:30).`);
        setLoading(false);
        return;
      }
    }

    try {
      const docRef = doc(db, COLLECTION_TIMER, DOCUMENT_ID);
      await setDoc(docRef, schedule, { merge: true }); // 'merge: true' per sicurezza
      setSuccess("Orari salvati con successo!");
    } catch (err) {
      console.error("Errore nel salvataggio orari:", err);
      setError("Impossibile salvare gli orari. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !success) {
    return <p>Caricamento configurazione orari...</p>;
  }

  return (
    <div>
      <h3>Gestione Orari Apertura Automatica</h3>
      <div style={cardStyle}>
        <form onSubmit={handleSave}>
          <p>Imposta gli orari in formato 24h (HH:MM).</p>
          
          <h4>Giorni Feriali (Lunedì - Venerdì)</h4>
          <div style={inputGroupStyle}>
            <label htmlFor="feriali_apertura" style={labelStyle}>Orario Apertura:</label>
            <input
              type="text"
              id="feriali_apertura"
              name="feriali_apertura"
              value={schedule.feriali_apertura}
              onChange={handleChange}
              style={inputStyle}
              maxLength="5"
            />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="feriali_chiusura" style={labelStyle}>Orario Chiusura:</label>
            <input
              type="text"
              id="feriali_chiusura"
              name="feriali_chiusura"
              value={schedule.feriali_chiusura}
              onChange={handleChange}
              style={inputStyle}
              maxLength="5"
            />
          </div>

          <hr style={{ margin: '2rem 0' }} />

          <h4>Sabato</h4>
          <div style={inputGroupStyle}>
            <label htmlFor="sabato_apertura" style={labelStyle}>Orario Apertura:</label>
            <input
              type="text"
              id="sabato_apertura"
              name="sabato_apertura"
              value={schedule.sabato_apertura}
              onChange={handleChange}
              style={inputStyle}
              maxLength="5"
            />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="sabato_chiusura" style={labelStyle}>Orario Chiusura:</label>
            <input
              type="text"
              id="sabato_chiusura"
              name="sabato_chiusura"
              value={schedule.sabato_chiusura}
              onChange={handleChange}
              style={inputStyle}
              maxLength="5"
            />
          </div>
          
          <hr style={{ margin: '2rem 0' }} />
          
          <p>La Domenica e i giorni festivi il timer rimarrà sempre **chiuso** (a meno di aperture manuali via Telegram).</p>

          <button 
            type="submit"
            style={{ ...buttonStyle, backgroundColor: loading ? '#ccc' : '#007bff' }}
            disabled={loading}
          >
            {loading ? 'Salvataggio...' : 'Salva Orari'}
          </button>
          
          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
          {success && <p style={{ color: 'green', marginTop: '1rem' }}>{success}</p>}
        </form>
      </div>
    </div>
  );
};

export default TimeManager;