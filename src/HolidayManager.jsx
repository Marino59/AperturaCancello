// src/HolidayManager.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebaseConfig';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query,
  where,
  getDocs
} from 'firebase/firestore';

const COLLECTION_HOLIDAYS = "holidays";

// Stili
const cardStyle = { backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '2rem' };
const inputGroupStyle = { marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' };
const labelStyle = { fontWeight: 'bold' };
const inputStyle = { padding: '8px', fontSize: '1.1em', flex: 1, fontFamily: 'monospace' };
const buttonStyle = { padding: '9px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1em' };
const listStyle = { listStyleType: 'none', padding: 0 };
const listItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee', backgroundColor: 'white' };
const deleteButtonStyle = { backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' };

const HolidayManager = () => {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newHoliday, setNewHoliday] = useState('');
  const [error, setError] = useState(null);

  // 1. Carica le festività in tempo reale
  useEffect(() => {
    setLoading(true);
    const holidaysQuery = query(collection(db, COLLECTION_HOLIDAYS));
    
    const unsubscribe = onSnapshot(holidaysQuery, (snapshot) => {
      const holidayData = snapshot.docs.map(doc => ({
        id: doc.id,
        date_string: doc.data().date_string
      }));
      setHolidays(holidayData);
      setLoading(false);
    }, (err) => {
      console.error("Errore nel caricamento festività:", err);
      setError("Impossibile caricare le festività.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  // Ordina le festività per la visualizzazione
  const sortedHolidays = useMemo(() => {
    return [...holidays].sort((a, b) => a.date_string.localeCompare(b.date_string));
  }, [holidays]);

  // 2. Gestisce l'aggiunta di una nuova festività
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    setError(null);
    const dateStringToAdd = newHoliday.trim();

    if (dateStringToAdd.length === 0) {
      setError("Il campo non può essere vuoto.");
      return;
    }
    
    // Formato di base (non troppo restrittivo, il bot gestirà il parsing)
    const validFormat = /^[0-3][0-9]\/[0-1][0-9]\/(\*|\d{4})$/;
    if (!validFormat.test(dateStringToAdd)) {
        setError("Formato non valido. Usa GG/MM/* (es. 25/12/*) o GG/MM/AAAA (es. 21/04/2025).");
        return;
    }
    
    // Controlla se esiste già
    const q = query(collection(db, COLLECTION_HOLIDAYS), where("date_string", "==", dateStringToAdd));
    const existing = await getDocs(q);
    if (!existing.empty) {
        setError("Questa data/regola esiste già.");
        setNewHoliday('');
        return;
    }

    try {
      await addDoc(collection(db, COLLECTION_HOLIDAYS), {
        date_string: dateStringToAdd
      });
      setNewHoliday(''); // Pulisci il campo
    } catch (err) {
      console.error("Errore nell'aggiungere la festività:", err);
      setError("Impossibile salvare la festività. Riprova.");
    }
  };
  
  // 3. Gestisce l'eliminazione di una festività
  const handleDelete = async (docId, dateString) => {
    if (!window.confirm(`Sei sicuro di voler eliminare la festività "${dateString}"?`)) {
        return;
    }
    try {
        await deleteDoc(doc(db, COLLECTION_HOLIDAYS, docId));
    } catch (err) {
        console.error("Errore nell'eliminare la festività:", err);
        alert("Errore durante l'eliminazione.");
    }
  };

  return (
    <div>
      <h3>Gestione Giorni Festivi</h3>
      <p>Il timer rimarrà **chiuso** in queste date (oltre a ogni Domenica).</p>
      
      <div style={cardStyle}>
        <h4>Aggiungi Festività</h4>
        <form onSubmit={handleAddHoliday}>
          <div style={inputGroupStyle}>
            <label htmlFor="holiday-date" style={labelStyle}>Data:</label>
            <input
              type="text"
              id="holiday-date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              style={inputStyle}
              placeholder="GG/MM/* o GG/MM/AAAA"
            />
            <button type="submit" style={buttonStyle}>Aggiungi</button>
          </div>
          {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
          <p style={{fontSize: '0.9em', color: '#555', marginTop: '0.5rem'}}>
            Usa `GG/MM/*` per festività ricorrenti (es. `25/12/*`).<br/>
            Usa `GG/MM/AAAA` per date specifiche (es. `21/04/2025` per Pasquetta).
          </p>
        </form>
      </div>

      <div style={cardStyle}>
        <h4>Festività Salve</h4>
        {loading ? (
          <p>Caricamento...</p>
        ) : (
          <ul style={listStyle}>
            {sortedHolidays.length === 0 ? (
                <li style={{...listItemStyle, backgroundColor: '#f9f9f9'}}>Nessuna festività personalizzata inserita.</li>
            ) : (
                sortedHolidays.map(holiday => (
                  <li key={holiday.id} style={listItemStyle}>
                    <span style={{fontFamily: 'monospace', fontSize: '1.2em'}}>{holiday.date_string}</span>
                    <button 
                        style={deleteButtonStyle}
                        onClick={() => handleDelete(holiday.id, holiday.date_string)}
                    >
                        Elimina
                    </button>
                  </li>
                ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default HolidayManager;