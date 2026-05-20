// src/PendingRequests.jsx

import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  where 
} from 'firebase/firestore';

const COLLECTION_LOGS = "gate_logs";

// Funzione per rifiutare
const handleReject = async (log) => {
  const nomeCompleto = `${log.telegram_nome || 'Utente'} ${log.telegram_cognome || ''}`.trim() || 'Utente Sconosciuto';
  if (!window.confirm(`Sei sicuro di voler rifiutare la richiesta di "${nomeCompleto}"?`)) {
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
  const [hoveredCardId, setHoveredCardId] = useState(null);

  useEffect(() => {
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
        
        if (!telegramId) return;
        
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

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  if (loading) return <p style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>Caricamento richieste in attesa...</p>;
  if (error) return <p style={{ color: '#dc3545', textAlign: 'center', marginTop: '20px', fontWeight: 'bold' }}>{error}</p>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '2px solid rgba(0,0,0,0.05)', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '1.6rem', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.8rem' }}>🚪</span> Richieste Non Autorizzate
        </h3>
        <span style={{ backgroundColor: '#dc3545', color: '#fff', borderRadius: '20px', padding: '4px 12px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          {requests.length} da gestire
        </span>
      </div>
      
      {requests.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px dashed #ccc', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem', marginBottom: '15px' }}>🎉</span>
          <p style={{ margin: 0, fontSize: '1.1rem', color: '#666', fontWeight: '500' }}>
            Nessuna richiesta di accesso non autorizzata presente al momento.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {requests.map((req) => {
            const nomeCompleto = `${req.telegram_nome || 'Utente'} ${req.telegram_cognome || ''}`.trim() || 'Sconosciuto';
            const requestDate = formatTimestamp(req.timestamp);
            const isHovered = hoveredCardId === req.id;

            return (
              <div 
                key={req.id} 
                onMouseEnter={() => setHoveredCardId(req.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                style={{ 
                  border: '1px solid rgba(220, 53, 69, 0.15)', 
                  borderRadius: '14px', 
                  padding: '20px', 
                  backgroundColor: '#ffffff',
                  boxShadow: isHovered ? '0 10px 25px rgba(0, 0, 0, 0.08)' : '0 4px 12px rgba(0, 0, 0, 0.03)',
                  transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '15px'
                }}
              >
                {/* Header della Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc3545', backgroundColor: '#fff0f1', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '6px' }}>
                      ⚠️ Richiesta Non Autorizzata
                    </span>
                    <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      👤 Nome e Cognome: <span style={{ color: '#1a202c', textDecoration: 'underline decoration-dotted' }}>{nomeCompleto}</span>
                    </h4>
                  </div>
                  {requestDate && (
                    <div style={{ fontSize: '0.8rem', color: '#718096', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f7fafc', padding: '4px 8px', borderRadius: '6px' }}>
                      🕒 {requestDate}
                    </div>
                  )}
                </div>

                {/* Corpo della Card: Messaggio Ricevuto */}
                <div style={{ backgroundColor: '#f8f9fa', borderLeft: '4px solid #dc3545', borderRadius: '4px', padding: '12px 16px', margin: '2px 0' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096', letterSpacing: '0.05em' }}>
                    💬 Testo del Messaggio:
                  </p>
                  <p style={{ margin: 0, fontSize: '1rem', fontStyle: 'italic', color: '#2d3748', lineHeight: '1.5' }}>
                    "{req.testo_ricevuto || 'Nessun messaggio di testo inserito.'}"
                  </p>
                </div>

                {/* Footer della Card: Dettagli Tecnici & Azioni */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', borderTop: '1px solid #edf2f7', paddingTop: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#4a5568', backgroundColor: '#edf2f7', padding: '4px 10px', borderRadius: '20px' }}>
                    <span>🤖 Telegram ID:</span>
                    <strong style={{ fontFamily: 'monospace' }}>{req.telegram_id}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => onApprove(req)} 
                      style={{ 
                        background: 'linear-gradient(135deg, #28a745 0%, #218838 100%)',
                        color: 'white', 
                        border: 'none', 
                        padding: '10px 20px', 
                        borderRadius: '8px', 
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px rgba(40, 167, 69, 0.2)',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 12px rgba(40, 167, 69, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(40, 167, 69, 0.2)';
                      }}
                    >
                      ✅ Approva e Registra
                    </button>
                    
                    <button 
                      onClick={() => handleReject(req)} 
                      style={{ 
                        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                        color: 'white', 
                        border: 'none', 
                        padding: '10px 20px', 
                        borderRadius: '8px', 
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px rgba(220, 53, 69, 0.2)',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 12px rgba(220, 53, 69, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(220, 53, 69, 0.2)';
                      }}
                    >
                      ❌ Rifiuta
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingRequests;