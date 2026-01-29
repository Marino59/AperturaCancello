// src/Home.jsx (Versione con Dashboard MUI - Layout finale)

import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

// IMPORTAZIONI MUI
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack'; 

// Icone
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PlagiarismIcon from '@mui/icons-material/Plagiarism';
import MessageIcon from '@mui/icons-material/Message';
import CampaignIcon from '@mui/icons-material/Campaign';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import GarageIcon from '@mui/icons-material/Garage';

const COLLECTION_UTENTI = "authorized_users";
const COLLECTION_LOGS = "gate_logs";

// Stile per la card principale (Richieste)
const mainCardStyle = {
  marginBottom: '2rem',
  border: '1px solid',
  borderColor: 'rgba(255, 0, 0, 0.6)', // Rosso per alta visibilità
  boxShadow: '0 4px 12px rgba(255, 0, 0, 0.15)'
};

const Home = ({ setView }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);

  // Conteggio Richieste Pendenti
  useEffect(() => {
    const q = query(collection(db, COLLECTION_LOGS), where("status", "==", "failed_unauthorized"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.size);
    });
    return () => unsubscribe();
  }, []);

  // Conteggio Utenti Totali
  useEffect(() => {
    const q = query(collection(db, COLLECTION_UTENTI));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalUsers(snapshot.size);
    });
    return () => unsubscribe();
  }, []);

  // Conteggio Log Totali (per statistica)
  useEffect(() => {
    const q = query(collection(db, COLLECTION_LOGS));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalLogs(snapshot.size);
    });
    return () => unsubscribe();
  }, []);


  return (
    <Box sx={{ flexGrow: 1 }}>
      <Grid container spacing={3}>
        
        {/* --- CARD PRINCIPALE: RICHIESTE SOSPESE --- */}
        <Grid item xs={12}>
          <Card sx={mainCardStyle}>
            <CardContent>
              <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                Richieste Sospese
              </Typography>
              <Typography variant="h3" component="p" sx={{ color: 'red', fontWeight: 'bold', mt: 1, mb: 1 }}>
                {pendingCount}
              </Typography>
              <Typography sx={{ mb: 1.5 }} color="text.secondary">
                Utenti in attesa di approvazione.
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                variant="contained" 
                size="large" 
                color="error"
                startIcon={<PendingActionsIcon />}
                onClick={() => setView('pending')}
              >
                Gestisci Richieste
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* --- GRUPPO 1: GESTIONE DATI --- */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Gestione Dati</Typography>
              <Stack spacing={1} direction="column">
                <Button variant="outlined" startIcon={<PeopleAltIcon />} onClick={() => setView('anagrafica')}>
                  Anagrafica ({totalUsers})
                </Button>
                <Button variant="outlined" startIcon={<PlagiarismIcon />} onClick={() => setView('log')}>
                  Log Accessi ({totalLogs})
                </Button>
                <Button variant="outlined" startIcon={<GarageIcon />} onClick={() => setView('garage')}>
                  Mappatura Garage
                </Button>
                <Button variant="outlined" startIcon={<MessageIcon />} onClick={() => setView('messaggi')}>
                  Testi Messaggi Bot
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* --- GRUPPO 2: GESTIONE BOT (MODIFICATO) --- */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Gestione Bot</Typography>
              <Stack spacing={1} direction="column">
                <Button variant="outlined" startIcon={<CampaignIcon />} onClick={() => setView('broadcast')}>
                  Invia Notifica
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* --- GRUPPO 3: GESTIONE TIMER (INVARIATO) --- */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Timer Automatico</Typography>
              <Stack spacing={1} direction="column">
                <Button variant="outlined" startIcon={<AccessTimeIcon />} onClick={() => setView('timer_orari')}>
                  Imposta Orari
                </Button>
                <Button variant="outlined" startIcon={<EventBusyIcon />} onClick={() => setView('timer_festivi')}>
                  Imposta Festività
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

      </Grid>
    </Box>
  );
};

export default Home;