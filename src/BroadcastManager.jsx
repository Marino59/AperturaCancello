// src/BroadcastManager.jsx (Versione 5: Aggiunta Formattazione Markdown)

import React, { useState, useEffect, useMemo, useRef } from 'react'; // Aggiunto useRef
import { db } from './firebaseConfig';
import { collection, addDoc, Timestamp, onSnapshot, query } from 'firebase/firestore';

const COLLECTION_BROADCASTS = "pending_broadcasts";
const COLLECTION_UTENTI = "authorized_users";

// Stili
const cardStyle = { backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const textareaStyle = { width: '100%', minHeight: '150px', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'inherit', fontSize: '1em', marginBottom: '0.5rem' }; // Rimosso margin-bottom
const buttonStyle = { padding: '12px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1.1em', fontWeight: 'bold' };
const inputGroupStyle = { marginBottom: '1rem' };
const labelStyle = { fontWeight: 'bold', marginBottom: '10px', display: 'block' };
const userListStyle = { maxHeight: '300px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', backgroundColor: 'white', borderRadius: '4px' };
const userItemStyle = { display: 'block', padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' };
const buttonLinkStyle = { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', padding: '0', margin: '0 10px 10px 0', textDecoration: 'underline' };

// --- STILI PER I PULSANTI DI FORMATTAZIONE ---
const formatToolbarStyle = {
  display: 'flex',
  gap: '10px',
  marginBottom: '10px',
};
const formatButtonStyle = {
  backgroundColor: '#eee',
  color: '#333',
  border: '1px solid #ccc',
  padding: '5px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'monospace'
};
// --- FINE STILI ---


const BroadcastManager = () => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const [selectedGroup, setSelectedGroup] = useState('__ALL__');
  const [selectedUsers, setSelectedUsers] = useState(new Set()); 
  
  // --- NUOVO: Ref per il textarea ---
  const textareaRef = useRef(null);
  // ---------------------------------

  // 1. Carica l'anagrafica completa (invariato)
  useEffect(() => {
    setLoadingUsers(true);
    const usersQuery = query(collection(db, COLLECTION_UTENTI));
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const now = new Date(); 
      const usersData = snapshot.docs
        .map(doc => ({
          id: doc.id, 
          telegram_id: doc.data().codice_telegram,
          nome: doc.data().nome,
          cognome: doc.data().cognome,
          gruppo: doc.data().gruppo || 'Nessun Gruppo',
          data_fine: doc.data().data_fine 
        }))
        .filter(user => {
          if (!user.data_fine) return true; 
          return user.data_fine.toDate() > now;
        });
      
      usersData.sort((a, b) => {
        const nameA = `${a.nome} ${a.cognome}`.toLowerCase();
        const nameB = `${b.nome} ${b.cognome}`.toLowerCase();
        return nameA.localeCompare(nameB); 
      });
      
      setAllUsers(usersData);
      setLoadingUsers(false);
    }, (err) => {
      console.error("Errore nel caricamento utenti:", err);
      setError("Impossibile caricare l'anagrafica per il filtro.");
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Estrae la lista dei gruppi unici dall'anagrafica (invariato)
  const uniqueGroups = useMemo(() => {
    const groups = new Set();
    allUsers.forEach(user => {
      const userGroups = user.gruppo || 'Nessun Gruppo';
      userGroups.split(',')
        .map(g => g.trim()) 
        .filter(g => g.length > 0)
        .forEach(g => groups.add(g));
    });
    return Array.from(groups).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [allUsers]);

  // 3. FILTRA la lista di utenti da mostrare (invariato)
  const filteredUsers = useMemo(() => {
    if (selectedGroup === '__ALL__') {
      return allUsers; 
    }
    return allUsers.filter(u => 
      (u.gruppo || 'Nessun Gruppo').split(',').map(g => g.trim()).includes(selectedGroup)
    );
  }, [allUsers, selectedGroup]);

  // 4. Auto-seleziona gli utenti quando il filtro cambia (invariato)
  useEffect(() => {
    const newSelection = new Set();
    filteredUsers.forEach(user => newSelection.add(user.telegram_id));
    setSelectedUsers(newSelection);
  }, [filteredUsers]);

  // 5. Gestisce la selezione di un utente singolo (invariato)
  const handleUserToggle = (telegramId) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(telegramId)) {
      newSelection.delete(telegramId);
    } else {
      newSelection.add(telegramId);
    }
    setSelectedUsers(newSelection);
  };
  
  // 6. Seleziona/Deseleziona TUTTI gli utenti *filtrati* (invariato)
  const toggleSelectAllFiltered = (selectAll) => {
    const newSelection = new Set(selectedUsers);
    const filteredIds = filteredUsers.map(u => u.telegram_id);
    
    if (selectAll) {
      filteredIds.forEach(id => newSelection.add(id));
    } else {
      filteredIds.forEach(id => newSelection.delete(id));
    }
    setSelectedUsers(newSelection);
  };

  // --- 7. NUOVA FUNZIONE: Inserisci Markdown ---
  const insertMarkdown = (markup) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    // Telegram Markdown V2 richiede di "escapare" alcuni caratteri
    // Per ora facciamo solo l'inserimento base
    let newText;
    if (markup === 'codeblock') {
      newText = `${text.substring(0, start)}\`\`\`\n${selectedText}\n\`\`\`${text.substring(end)}`;
    } else {
      const char = markup === 'bold' ? '*' : '_';
      newText = `${text.substring(0, start)}${char}${selectedText}${char}${text.substring(end)}`;
    }

    setMessage(newText);
    
    // Rimetti il focus sul textarea
    textarea.focus();
    // (Opzionale: ri-seleziona il testo)
    // const newEnd = end + (markup === 'codeblock' ? 8 : 2);
    // textarea.setSelectionRange(start, newEnd); 
  };
  // --- FINE NUOVA FUNZIONE ---

  // 8. Gestione Invio (invariato)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (message.trim().length === 0) {
      setError("Il messaggio non può essere vuoto.");
      setLoading(false);
      return;
    }
    
    const targetIds = Array.from(selectedUsers);

    if (targetIds.length === 0) {
      setError("Devi selezionare almeno un utente.");
      setLoading(false);
      return;
    }

    if (!window.confirm(`Stai per inviare questo messaggio a ${targetIds.length} utente/i. Sei sicuro?`)) {
      setLoading(false);
      return;
    }

    try {
      const broadcastTask = {
        testo_messaggio: message,
        target: {
          target_type: "list",
          target_value: targetIds 
        },
        status: "pending", 
        creato_il: Timestamp.now(),
        // --- NUOVO CAMPO ---
        parse_mode: "MarkdownV2" // Diciamo al bot di usare la formattazione
      };

      await addDoc(collection(db, COLLECTION_BROADCASTS), broadcastTask);
      
      setSuccess("Ordine di invio inoltrato con successo! Il bot sul Pi inizierà l'invio.");
      setMessage('');

    } catch (err) {
      console.error("Errore nell'inoltrare il broadcast:", err);
      setError("Si è verificato un errore. L'ordine non è stato inviato.");
    } finally {
      setLoading(false);
    }
  };
  
  const selectedInFilterCount = filteredUsers.filter(u => selectedUsers.has(u.telegram_id)).length;

  return (
    <div>
      <h3>Invia Notifica (Solo Utenti Attivi)</h3>
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          
          <div style={inputGroupStyle}>
            <label htmlFor="group_filter" style={labelStyle}>Filtra Destinatari per Gruppo:</label>
            <select 
              id="group_filter"
              disabled={loadingUsers}
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{padding: '8px', fontSize: '1em'}}
            >
              <option value="__ALL__">{loadingUsers ? 'Carico...' : 'Tutti i Gruppi'}</option>
              {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          
          <div style={inputGroupStyle}>
            <label style={labelStyle}>
              Utenti Selezionati ({selectedUsers.size} totali)
            </label>
            
            <div style={{...userListStyle, borderColor: selectedUsers.size === 0 ? '#dc3545' : '#ccc'}}>
              {loadingUsers ? <p>Caricamento utenti...</p> : filteredUsers.map(user => (
                <label key={user.id} style={userItemStyle}>
                  <input 
                    type="checkbox" 
                    checked={selectedUsers.has(user.telegram_id)}
                    onChange={() => handleUserToggle(user.telegram_id)}
                  />
                  {user.nome} {user.cognome} ({user.gruppo})
                </label>
              ))}
            </div>
            <div style={{marginTop: '5px', fontSize: '0.9em'}}>
              <button type="button" style={buttonLinkStyle} onClick={() => toggleSelectAllFiltered(true)}>
                Seleziona tutti i {filteredUsers.length} filtrati
              </button>
              <button type="button" style={buttonLinkStyle} onClick={() => toggleSelectAllFiltered(false)}>
                Deseleziona tutti i {filteredUsers.length} filtrati
              </button>
              <span style={{color: '#555'}}>
                (Stai vedendo {filteredUsers.length} utenti / {selectedInFilterCount} selezionati in questo filtro)
              </span>
            </div>
          </div>


          {/* --- MESSAGGIO E TOOLBAR DI FORMATTAZIONE --- */}
          <div style={inputGroupStyle}>
            <label htmlFor="broadcast-message" style={labelStyle}>
              Messaggio da Inviare:
            </label>
            
            {/* Toolbar */}
            <div style={formatToolbarStyle}>
              <button type="button" style={formatButtonStyle} onClick={() => insertMarkdown('bold')}>
                *Grassetto*
              </button>
              <button type="button" style={formatButtonStyle} onClick={() => insertMarkdown('italic')}>
                _Corsivo_
              </button>
              <button type="button" style={formatButtonStyle} onClick={() => insertMarkdown('codeblock')}>
                {"```Codice```"}
              </button>
            </div>
            
            <textarea
              id="broadcast-message"
              ref={textareaRef} // Assegna la ref
              style={textareaStyle}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scrivi qui il tuo avviso... Seleziona del testo e clicca i pulsanti per formattare."
              disabled={loading}
            />
            <p style={{fontSize: '0.9em', color: '#555', marginTop: '0'}}>
              <b>Attenzione:</b> Telegram richiede che i caratteri speciali come `.`, `!`, `-` siano "escapati" (es. `\.`, `\!`). 
              Per ora, scrivi testi semplici.
            </p>
          </div>
          {/* --- FINE BLOCCO MESSAGGIO --- */}
          
          <button 
            type="submit"
            style={{ ...buttonStyle, backgroundColor: loading ? '#ccc' : '#dc3545' }}
            disabled={loading || selectedUsers.size === 0}
          >
            {loading ? 'Invio...' : `Invia a ${selectedUsers.size} Utenti`}
          </button>
          
          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
          {success && <p style={{ color: 'green', marginTop: '1rem' }}>{success}</p>}
        </form>
      </div>
    </div>
  );
};

export default BroadcastManager;