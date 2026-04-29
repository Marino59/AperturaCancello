# Guida di Ripristino Rapido del Cancello 🚨

Questa guida ti spiega esattamente cosa fare se il Raspberry Pi principale smette di funzionare o la scheda SD si rompe. Hai già tutto l'hardware di riserva!

Segui questi passi uno alla volta. Se ti trovi in difficoltà in qualsiasi punto, **fermati e chiedimi aiuto**.

---

## 🛠️ Cosa ti serve
1. Il Raspberry Pi di riserva.
2. La scheda MicroSD di ricambio.
3. Un computer con un lettore di schede SD.
4. L'alimentatore e i cavi collegati al vecchio Raspberry.

---

## 📋 FASE 1: Preparazione della Scheda SD (Al Computer)

Dobbiamo installare il "motore" (il sistema operativo) sulla nuova scheda.

1. Inserisci la nuova scheda MicroSD nel tuo computer.
2. Scarica e installa il programma ufficiale **Raspberry Pi Imager** da qui: [https://www.raspberrypi.com/software/](https://www.raspberrypi.com/software/)
3. Apri Raspberry Pi Imager:
   * **Dispositivo:** Seleziona il modello del tuo Raspberry Pi (es. Raspberry Pi 4 o quello che hai).
   * **Sistema Operativo:** Scegli `Raspberry Pi OS (64-bit)`.
   * **Memoria:** Scegli la tua scheda MicroSD.
4. Clicca su **Avanti**.
5. **IMPORTANTE (Impostazioni di configurazione):** Il programma ti chiederà se vuoi personalizzare le impostazioni. Clicca su **"Modifica impostazioni"**:
   * **Generale:**
     * Nome host: `pi64`
     * Nome utente: `pi64`
     * Password: `speriamobene`
     * Configura il Wi-Fi (metti il nome e la password del Wi-Fi del cancello).
   * **Servizi:**
     * Spunta la casella **"Abilita SSH"** (usa l'autenticazione con password).
6. Salva e clicca su **SÌ** per iniziare la scrittura. Attendi che finisca.

---

## 🔌 FASE 2: Collegamento Hardware (Sul Posto)

1. Estrai la scheda MicroSD dal computer e inseriscila nel Raspberry Pi di riserva.
2. Scollega i cavi (Alimentazione e i cavetti che vanno alla scheda relè del cancello) dal vecchio Raspberry.
3. Ricollega i cavetti alla scheda relè rispettando esattamente gli stessi PIN (fai una foto al vecchio prima di staccare!).
   * *Riferimento PIN:*
     * Trasmettitore RF: PIN 18
     * Relè Cancello: PIN 12
     * Relè Timer: PIN 23
4. Collega l'alimentazione al nuovo Raspberry. Si accenderà. Attendi 2-3 minuti affinché si colleghi al Wi-Fi.

---

## 💻 FASE 3: Ripristino del Programma (Guidato da Me)

Una volta che il Raspberry è acceso e connesso, **non devi fare altro da solo**.

1. Apri questa chat.
2. Scrivimi: *"Ho preparato e collegato il nuovo Raspberry Pi. Procediamo con l'installazione del programma del cancello."*
3. **Io mi occuperò di:**
   * Collegarmi al nuovo Raspberry tramite la rete.
   * Creare la cartella `~/cancello`.
   * Installare Python e le librerie necessarie (venv, telegram, firebase-admin, rpi-rf).
   * Copiare i file del programma (abbiamo i backup pronti sul tuo computer!).
   * Configurare il file `telegram_token.txt` e `serviceAccountKey.json`.
   * Impostare l'avvio automatico con `systemctl`.

## 🆘 Cosa fare se non si collega a Internet?
Se vedi che non riesco a collegarmi, potrebbe essere che il Wi-Fi non ha preso. In tal caso, prova a collegare il Raspberry temporaneamente al router con un cavo di rete (LAN).

*Fai una foto ai collegamenti del vecchio Raspberry Pi PRIMA di smontarlo, ti salverà la vita!*

---

## 🖥️ FASE 4: Ripristino del Pannello di Controllo Web (Su un nuovo PC)

Se cambi computer o perdi i file del pannello di controllo web, segui questi passi per rimetterlo in funzione:

1. **Installa Node.js:** Scarica e installa Node.js (versione LTS) da [https://nodejs.org/](https://nodejs.org/).
2. **Scarica il codice dal tuo repository:**
   * Apri PowerShell sul tuo computer.
   * Spostati nella cartella dove vuoi salvare il progetto (es. `cd C:\Users\marin\Progetti`).
   * Esegui il comando per scaricare i file:
     ```powershell
     git clone https://github.com/Marino59/AperturaCancello.git cancello-admin
     ```
   * Entra nella cartella del progetto:
     ```powershell
     cd cancello-admin
     ```
   * Passa al branch di lavoro corretto:
     ```powershell
     git checkout feature/delicate-modifications
     ```
3. **Installa le dipendenze:**
   * Esegui il comando:
     ```powershell
     npm install
     ```
4. **Avvia il programma per provarlo:**
   * Esegui il comando:
     ```powershell
     npm run dev
     ```
   * Il programma si aprirà nel browser all'indirizzo `http://localhost:5173`.

5. **Pubblica il sito online (Firebase Hosting):**
   * Se vuoi che il pannello sia accessibile ovunque (come adesso):
     ```powershell
     npm run build
     ```
     e poi:
     ```powershell
     npx firebase deploy
     ```
   * *(Se richiesto, fai l'accesso con il tuo account Google usando il comando `npx firebase login`)*

