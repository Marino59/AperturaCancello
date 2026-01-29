import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
// --- MODIFICA: Importiamo 'getDocs' per caricare gli utenti ---
import { collection, query, limit, onSnapshot, orderBy, getDocs } from 'firebase/firestore';

const LogTable = () => {
  const [logs, setLogs] = useState([]);
  // --- MODIFICA: Creiamo uno stato per la mappa degli utenti ---
  // (es. Map{"12345" -> {nome: "Mario", cognome: "Rossi"}})
  const [usersMap, setUsersMap] = useState(new Map());
  
  // --- MODIFICA: Dividiamo lo stato di caricamento ---
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // --- MODIFICA: Un nuovo useEffect per caricare gli UTENTI (una sola volta) ---
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, 'authorized_users');
        const querySnapshot = await getDocs(usersRef);
        
        const userMap = new Map();
        querySnapshot.forEach(doc => {
          const data = doc.data();
          // --- IMPORTANTE: Usiamo 'codice_telegram' come chiave della mappa ---
          // Se il campo in 'authorized_users' si chiama 'telegram_id', cambialo qui.
          const telegramId = data.codice_telegram;
          
          if (telegramId) {
            userMap.set(telegramId, {
              nome: data.nome || '',
              cognome: data.cognome || ''
            });
          }
        });
        
        setUsersMap(userMap);
        
      } catch (error) {
        console.error("Errore nel caricare gli utenti:", error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []); // L'array vuoto [] significa "esegui solo una volta, al montaggio"

  // Questo useEffect per i LOG rimane quasi identico
  useEffect(() => {
    setLoadingLogs(true);
    const logsRef = collection(db, 'gate_logs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      // Salviamo i log "grezzi" come arrivano
      const logsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(0), 
        };
      });
      
      setLogs(logsData);
      setLoadingLogs(false);
    }, (error) => {
      console.error("Errore nel listener dei log:", error);
      setLoadingLogs(false);
    });

    return () => unsubscribe();
    
  }, []); 

  // Formatta lo stato per la visualizzazione
  const getMessageStyle = (status) => {
    // ... (questa funzione non cambia) ...
    if (status === 'system_offline' || status === 'system_reboot') {
      return { color: '#dc3545', fontWeight: '600' }; // Rosso
    }
    if (status === 'system_online') {
      return { color: '#28a745', fontWeight: '600' }; // Verde
    }
    return {};
  };

  // --- MODIFICA: Mostra "Caricamento" finché ENTRAMBI non sono pronti ---
  if (loadingLogs || loadingUsers) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="table-container">
      <h2>Log Ingressi e Eventi (Ultimi 100)</h2>
      <table>
        <thead>
          <tr>
            <th>Data e Ora</th>
            <th>Nome</th>
            <th>Cognome</th>
            <th>Gruppo</th>
            {/* <th>ID Telegram</th> // --- COLONNA RIMOSSA --- */}
            <th>Richiesta</th>
            <th>Messaggio Ricevuto</th>
            <th>Dettagli Evento</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            // --- MODIFICA: Aggiornato colSpan a 7 ---
            <tr><td colSpan="7">Nessun log trovato.</td></tr>
          ) : (
            // --- MODIFICA CHIAVE: Logica di "join" nel render ---
            logs.map(log => {
              
              // 1. Cerchiamo l'utente nella mappa usando l'ID del log
              //    Assicurati che log.telegram_id sia una stringa, se 'codice_telegram' lo è.
              const user = usersMap.get(String(log.telegram_id));
              
              // 2. Prepariamo le variabili
              const nome = user ? user.nome : log.telegram_nome; // Fallback sul nome telegram
              const cognome = user ? user.cognome : log.telegram_cognome; // Fallback sul cognome telegram

              return (
                <tr key={log.id}>
                  <td>
                    {log.timestamp.getTime() === 0 
                      ? 'Data non disp.' 
                      : log.timestamp.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' })
                    }
                  </td>
                  
                  {/* --- MODIFICA: Usiamo i nomi trovati --- */}
                  <td>{nome || 'N/D'}</td>
                  <td>{cognome || 'N/D'}</td>
                  
                  <td>{log.gruppo_utente || 'N/D'}</td>
                  {/* <td>{log.telegram_id || 'N/D'}</td> // --- CELLA RIMOSSA --- */}
                  <td>{log.garage_richiesto || 'N/D'}</td>
                  <td>{log.testo_ricevuto || ''}</td>
                  <td style={getMessageStyle(log.status)}>
                    {log.messaggio || ''}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LogTable;