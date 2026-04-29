import React from 'react';
import { Box, Button, Card, CardContent, Typography, Stack } from '@mui/material';
import PowerIcon from '@mui/icons-material/Power';
import PowerOffIcon from '@mui/icons-material/PowerOff';

const OutletManager = ({ onOutletCommand }) => {
    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h4" gutterBottom>Controllo Presa Elettrica</Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
                Utilizza i pulsanti sottostanti per controllare la presa.
                <br />
                <strong>Nota:</strong> La presa si spegnerà automaticamente dopo 2 ore dall'accensione.
            </Typography>

            <Card sx={{ maxWidth: 400, mx: 'auto', mt: 4, p: 2 }}>
                <CardContent>
                    <Stack spacing={3}>
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            startIcon={<PowerIcon />}
                            fullWidth
                            sx={{ py: 2, fontSize: '1.2rem' }}
                            onClick={() => onOutletCommand('outlet_on')}
                        >
                            Accendi Presa
                        </Button>

                        <Button
                            variant="contained"
                            color="error"
                            size="large"
                            startIcon={<PowerOffIcon />}
                            fullWidth
                            sx={{ py: 2, fontSize: '1.2rem' }}
                            onClick={() => onOutletCommand('outlet_off')}
                        >
                            Spegni Presa
                        </Button>
                    </Stack>
                </CardContent>
            </Card>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Button variant="text" onClick={() => window.history.back()}>
                    Torna indietro
                </Button>
            </Box>
        </Box>
    );
};

export default OutletManager;
