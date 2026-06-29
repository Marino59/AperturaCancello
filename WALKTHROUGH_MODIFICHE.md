# Walkthrough Modifiche e Diagnostica Bot Telegram (Giugno 2026)

Questo documento riassume le modifiche applicate al codice dei bot e le procedure eseguite per risolvere gli errori rilevati nei log del Raspberry Pi.

---

## 1. Modifiche a `gate_bot.py` (Bot Principale del Cancello)

### Errore Risolto
* `AttributeError: 'NoneType' object has no attribute 'text'`
* **Causa**: Il bot andava in crash quando riceveva eventi o messaggi non testuali (es. modifiche a messaggi esistenti, adesivi, foto o messaggi di servizio di Telegram) per cui `update.message` o `update.message.text` risultavano pari a `None`.

### Soluzione Applicata
* Aggiunti controlli di sicurezza (guardie) all'inizio della funzione `gestisci_messaggio` per ignorare aggiornamenti privi di testo o privi di utente associato:
  ```python
  async def gestisci_messaggio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
      if not update.message or not update.message.text:
          return

      if not cache_ready_garage.is_set():
          await update.message.reply_text("Riavvio in corso..."); return
      
      with connection_lock:
          if not is_currently_connected:
              await update.message.reply_text("Sistema OFFLINE. Cancello aperto per sicurezza."); return

      user = update.effective_user
      if not user:
          return
      uid = str(user.id)
      msg = update.message.text.strip()
  ```
* **Punto di ripristino**: Creato un backup in `backup_pi/cancello/gate_bot.py.bak`.

---

## 2. Modifiche a `broadcast_bot.py` (Bot Invio Messaggi Massivi)

### Errori Risolti
1. `RuntimeError: 'Event loop is closed'`
   * **Causa**: Il codice apriva e chiudeva un loop di eventi asyncio per ogni singolo destinatario del broadcast. Questo portava alla chiusura della connessione di rete interna del client Telegram globale. Nei messaggi successivi, il bot tentava di riusare la connessione legata al loop chiuso, fallendo a catena per tutti gli utenti rimanenti.
2. `Can't parse entities: character '.' is reserved...`
   * **Causa**: Quando si invia in modalità `MarkdownV2`, Telegram richiede l'escaping obbligatorio di tutti i caratteri speciali (inclusi i punti `.`). Se il testo conteneva punti non protetti, Telegram rifiutava l'intero invio per quel destinatario.

### Soluzione Applicata
* Riprogettato il flusso di invio asincrono in `process_broadcast` per utilizzare un **unico event loop** per l'intero invio massivo e inizializzare un client `Bot` locale associato a quel loop.
* Implementato un **fallback automatico in testo semplice**: se l'invio in Markdown fallisce a causa di errori di sintassi o caratteri riservati, il bot riprova immediatamente l'invio a quell'utente disattivando il `parse_mode` per garantirne la consegna.
  ```python
  async def send_all():
      nonlocal sent_count, failed_count
      local_bot = telegram.Bot(token=TELEGRAM_TOKEN)
      await local_bot.initialize()
      try:
          for i, user in enumerate(recipient_list):
              ...
              try:
                  try:
                      await local_bot.send_message(
                          chat_id=user_id, 
                          text=testo_messaggio, 
                          parse_mode=parse_mode
                      )
                  except telegram.error.BadRequest as e:
                      err_str = str(e).lower()
                      if parse_mode and ("can't parse" in err_str or "character" in err_str or "can't find end" in err_str):
                          logger.warning(f"Errore parsing {parse_mode} per {user_name}. Riprovo come testo semplice.")
                          await local_bot.send_message(
                              chat_id=user_id, 
                              text=testo_messaggio, 
                              parse_mode=None
                          )
                      else:
                          raise
                  ...
      finally:
          await local_bot.shutdown()
  ```
* **Punto di ripristino**: Creato un backup in `backup_pi/cancello/broadcast_bot.py.bak`.

---

## 3. Gestione e Riavvio dei Servizi sul Raspberry Pi

Entrambi i file corretti sono stati caricati sul Raspberry Pi e i rispettivi servizi di sistema sono stati riavviati:
* `gate_bot.service` -> Riavviato (PID attuale: `1841`, Stato: `active (running)`)
* `broadcast_bot.service` -> Riavviato (PID attuale: `1947`, Stato: `active (running)`)

### Risoluzione dei Conflitti di Istanze Duplicate
I log mostravano errori di conflitto (`Conflict: terminated by other getUpdates request`). Ciò avviene se il bot viene avviato a mano mentre il servizio di sistema è già attivo.
Per risolvere, assicurarsi di gestire il ciclo di vita del bot **esclusivamente** tramite `systemctl`:
* Arresto: `sudo systemctl stop <nome_servizio>`
* Avvio: `sudo systemctl start <nome_servizio>`
* Riavvio: `sudo systemctl restart <nome_servizio>`
* Verifica processi attivi: `ps aux | grep _bot.py` (non devono esserci processi orfani al di fuori di quelli controllati da systemd).
