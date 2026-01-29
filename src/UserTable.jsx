// src/UserTable.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebaseConfig';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore'; 

import EditUserModal from './EditUserModal.jsx';

const COLLECTION_UTENTI = "authorized_users";

const UserTable = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'ascending' });
  
  // --- NUOVO STATO PER LA RICERCA ---
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, COLLECTION_UTENTI), 
      (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(usersData);
        setLoading(false);
      },
      (err) => {
        console.error("Errore nel recupero dati Firestore:", err);
        setError("Impossibile caricare i dati.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // --- LOGICA FILTRAGGIO E ORDINAMENTO (MODIFICATA) ---
  const sortedUsers = useMemo(() => {
    
    // --- 1. FILTRAGGIO (NUOVA PARTE) ---
    let filteredUsers = [...users];
    if (searchQuery.trim() !== '') {
      const lowerCaseQuery = searchQuery.toLowerCase();
      
      filteredUsers = filteredUsers.filter(user => {
        // Cerca in tutti i valori di ogni oggetto utente (nome, cognome, id, commento, ecc.)
        return Object.values(user).some(value => {
          if (value === null || value === undefined) {
            return false;
          }
          // Converte ogni valore (stringa, numero, id) in stringa per la ricerca
          return String(value).toLowerCase().includes(lowerCaseQuery);
        });
      });
    }

    // --- 2. ORDINAMENTO (PARTE ESISTENTE, ora usa filteredUsers) ---
    let sortableUsers = [...filteredUsers]; // Lavora sull'array già filtrato
    if (sortConfig.key !== null) {
      sortableUsers.sort((a, b) => {
        if (a[sortConfig.key] === undefined || a[sortConfig.key] === null) return 1;
        if (b[sortConfig.key] === undefined || b[sortConfig.key] === null) return -1;

        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (aValue.toDate && typeof aValue.toDate === 'function') {
          aValue = aValue.toDate();
          bValue = bValue.toDate();
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
    
    // Aggiungi 'searchQuery' alle dipendenze di useMemo
  }, [users, sortConfig, searchQuery]); 

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

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Sei sicuro di voler eliminare l'utente "${userName}"?`)) {
      return;
    }
    try {
      const userDocRef = doc(db, COLLECTION_UTENTI, userId);
      await deleteDoc(userDocRef);
    } catch (err) {
      console.error("Errore during l'eliminazione:", err);
      alert("Si è verificato un errore during l'eliminazione.");
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return ''; 
    return timestamp.toDate().toLocaleString('it-IT', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  if (loading) return <p>Caricamento anagrafica...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  const thStyle = {
    cursor: 'pointer',
    userSelect: 'none', 
  };
  
  const trEvenStyle = { 
    backgroundColor: '#f2f2f2', 
    color: '#212529' 
  };
  const trOddStyle = { 
    backgroundColor: '#ffffff', 
    color: '#212529' 
  };

  return (
    <> 
      <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
        <h3>Anagrafica Utenti Autorizzati</h3>
        
        <div style={{ marginBottom: '1rem', width: '100%', maxWidth: '400px', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Cerca in tutti i campi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              flex: 1,
              padding: '8px 10px', 
              fontSize: '16px', 
              boxSizing: 'border-box', 
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
          <button
            onClick={() => {
              if (sortedUsers.length === 0) {
                alert("Nessun utente da esportare.");
                return;
              }
              
              // 1. Definizione Intestazioni
              const headers = [
                "Nome", "Cognome", "Codice Telegram", "Nome Telegram", "Cognome Telegram",
                 "Garage", "Gruppo", "Data Inizio", "Data Fine", "Commento", "ID Database"
              ];

              // 2. Mappatura Dati
              const rows = sortedUsers.map(user => {
                const formatDateCSV = (timestamp) => {
                  if (!timestamp) return '';
                  try {
                    return timestamp.toDate().toLocaleString('it-IT');
                  } catch (e) { return ''; }
                };

                return [
                  `"${(user.nome || '').replace(/"/g, '""')}"`,
                  `"${(user.cognome || '').replace(/"/g, '""')}"`,
                  `"${(user.codice_telegram || '').replace(/"/g, '""')}"`,
                  `"${(user.nome_telegram || '').replace(/"/g, '""')}"`,
                  `"${(user.cognome_telegram || '').replace(/"/g, '""')}"`,
                  `"${(user.garage || '').replace(/"/g, '""')}"`,
                  `"${(user.gruppo || '').replace(/"/g, '""')}"`,
                  `"${formatDateCSV(user.data_inizio)}"`,
                  `"${formatDateCSV(user.data_fine)}"`,
                  `"${(user.commento || '').replace(/"/g, '""')}"`,
                  `"${user.id}"`
                ].join(",");
              });

              // 3. Unione Intestazioni e Righe
              const csvContent = [headers.join(","), ...rows].join("\n");

              // 4. Creazione Blob e Download
              const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.setAttribute("href", url);
              const dateStr = new Date().toISOString().split('T')[0];
              link.setAttribute("download", `utenti_autorizzati_${dateStr}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            style={{
              padding: '8px 15px',
              fontSize: '16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Esporta CSV
          </button>
        </div>
        
        <table border="1" cellPadding="5" cellSpacing="0" style={{ width: '100%', minWidth: '1000px' }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => requestSort('nome')}>
                Nome{getSortIndicator('nome')}
              </th>
              <th style={thStyle} onClick={() => requestSort('cognome')}>
                Cognome{getSortIndicator('cognome')}
              </th>
              <th style={thStyle} onClick={() => requestSort('data_inizio')}>
                Data Inizio{getSortIndicator('data_inizio')}
              </th>
              <th style={thStyle} onClick={() => requestSort('data_fine')}>
                Data Fine{getSortIndicator('data_fine')}
              </th>
              <th style={thStyle} onClick={() => requestSort('garage')}>
                Garage{getSortIndicator('garage')}
              </th>
              <th style={thStyle} onClick={() => requestSort('gruppo')}>
                Gruppo{getSortIndicator('gruppo')}
              </th>
              <th style={thStyle} onClick={() => requestSort('commento')}>
                Commento{getSortIndicator('commento')}
              </th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.length === 0 ? (
              <tr>
                <td colSpan="8">
                  {searchQuery ? 'Nessun utente trovato per la ricerca.' : 'Nessun utente trovato.'}
                </td>
              </tr>
            ) : (
              sortedUsers.map((user, index) => (
                <tr 
                  key={user.id} 
                  style={index % 2 === 0 ? trEvenStyle : trOddStyle}
                >
                  <td>{user.nome || ''}</td>
                  <td>{user.cognome || ''}</td>
                  <td>{formatDate(user.data_inizio)}</td>
                  <td>{formatDate(user.data_fine)}</td>
                  <td>{user.garage || ''}</td>
                  <td>{user.gruppo || ''}</td>
                  <td>{user.commento || ''}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => setEditingUser(user)}
                      style={{ marginRight: '5px', backgroundColor: '#007bff', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Modifica
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id, user.nome)}
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

      {editingUser && (
        <EditUserModal 
          user={editingUser} 
          onClose={() => setEditingUser(null)}
        />
      )}
    </>
  );
};

export default UserTable;