// src/GarageManager.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebaseConfig';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc,
  updateDoc, 
  query,
  orderBy
} from 'firebase/firestore';

const COLLECTION_GARAGE = "garage_mapping";

const GarageManager = () => {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stato per il form
  const [garageId, setGarageId] = useState('');
  const [radioCode, setRadioCode] = useState('');
  const [formError, setFormError] = useState('');
  
  const [editingDocId, setEditingDocId] = useState(null); 
  const [sortConfig, setSortConfig] = useState({ key: 'garage_id', direction: 'ascending' });

  // 1. Legge la collezione
  useEffect(() => {
    const garageQuery = query(collection(db, COLLECTION_GARAGE));
    
    const unsubscribe = onSnapshot(garageQuery, (snapshot) => {
      const garageData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGarages(garageData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError("Impossibile caricare la mappa garage.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- 2. LOGICA ORDINAMENTO (MODIFICATA PER NUMERI/TESTO) ---
  const sortedGarages = useMemo(() => {
    let sortableGarages = [...garages];
    if (sortConfig.key !== null) {
      sortableGarages.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // --- NUOVA LOGICA: Gestisce sia numeri che stringhe ---
        const aNum = parseFloat(aValue);
        const bNum = parseFloat(bValue);

        const aIsNum = !isNaN(aNum);
        const bIsNum = !isNaN(bNum);

        if (aIsNum && bIsNum) {
            // Entrambi sono numeri, ordina numericamente
            aValue = aNum;
            bValue = bNum;
        } else {
            // Almeno uno non è un numero, ordina come stringa case-insensitive
            aValue = String(aValue).toLowerCase();
            bValue = String(bValue).toLowerCase();
        }
        // --- FINE NUOVA LOGICA ---

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableGarages;
  }, [garages, sortConfig]);

  // (Il resto delle funzioni non cambia...)
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return ' ↕';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!garageId || !radioCode) {
      setFormError("ID Garage e Codice Radio sono obbligatori.");
      return;
    }

    const dataToSave = {
      garage_id: garageId,
      radio_code: Number(radioCode),
    };

    try {
      if (editingDocId) {
        const docRef = doc(db, COLLECTION_GARAGE, editingDocId);
        await updateDoc(docRef, dataToSave);
        setFormError("Garage aggiornato con successo!");
      } else {
        await addDoc(collection(db, COLLECTION_GARAGE), dataToSave);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      
      if (err.message && err.message.includes("No document to update")) {
        setFormError("Errore: Il garage che stavi modificando è stato eliminato. Il modulo è stato resettato.");
        resetForm(); 
      } else {
        setFormError("Errore nel salvataggio: " + err.message);
      }
    }
  };

  const handleDelete = async (docId, garageName) => {
    if (!window.confirm(`Sei sicuro di voler eliminare il garage "${garageName}"?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, COLLECTION_GARAGE, docId));
    } catch (err) {
      console.error(err);
      alert("Errore during l'eliminazione.");
    }
  };
  
  const handleEdit = (garage) => {
    setEditingDocId(garage.id); 
    setGarageId(garage.garage_id);
    setRadioCode(garage.radio_code);
    setFormError('');
  };

  const resetForm = () => {
    setEditingDocId(null);
    setGarageId('');
    setRadioCode('');
    setFormError('');
  };

  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      
      {/* Colonna 1: Form di Aggiunta/Modifica */}
      <div style={{ flex: 1 }}>
        <h3>{editingDocId ? 'Modifica Garage' : 'Aggiungi Garage'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
          <div>
            <label>ID Garage (es. "0" o "9" o "BoxA"):</label>
            <input 
              type="text" 
              value={garageId} 
              onChange={(e) => setGarageId(e.target.value)} 
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label>Codice Radio (es. "14998161"):</label>
            <input 
              type="number" 
              value={radioCode} 
              onChange={(e) => setRadioCode(e.target.value)} 
              style={{ width: '100%' }}
            />
          </div>
          <button type="submit">
            {editingDocId ? 'Salva Modifiche' : 'Aggiungi Garage'}
          </button>
          {editingDocId && (
            <button type="button" onClick={resetForm} style={{marginTop: '5px'}}>
              Annulla Modifica
            </button>
          )}
          {formError && <p style={{ color: 'red', marginTop: '5px' }}>{formError}</p>}
        </form>
      </div>

      {/* Colonna 2: Tabella Garage Esistenti */}
      <div style={{ flex: 2 }}>
        <h3>Mappa Garage Esistenti</h3>
        {loading && <p>Caricamento...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <table border="1" cellPadding="5" cellSpacing="0" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th onClick={() => requestSort('garage_id')} style={{cursor: 'pointer'}}>
                ID Garage{getSortIndicator('garage_id')}
              </th>
              <th onClick={() => requestSort('radio_code')} style={{cursor: 'pointer'}}>
                Codice Radio{getSortIndicator('radio_code')}
              </th>
              <th>Azione</th>
            </tr>
          </thead>
          <tbody>
            {sortedGarages.length === 0 ? (
              <tr><td colSpan="3">Nessun garage mappato.</td></tr>
            ) : (
              sortedGarages.map(g => (
                <tr key={g.id}>
                  <td>{g.garage_id}</td>
                  <td>{g.radio_code}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => handleEdit(g)}
                      style={{ marginRight: '5px', backgroundColor: '#007bff', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Modifica
                    </button>
                    <button 
                      onClick={() => handleDelete(g.id, g.garage_id)}
                      style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GarageManager;