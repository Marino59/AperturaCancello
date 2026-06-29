import logging
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone
import telegram 
import time
import threading 
import sys 
import asyncio 

# --- CONFIGURAZIONE ---
TELEGRAM_TOKEN = "6854706513:AAHOx8vtVGeXQj5d1FhVu66dXnv2fewlu8o" 
FIREBASE_KEY_FILE = "serviceAccountKey.json" 

# Nomi delle Collezioni
COLLECTION_UTENTI = "authorized_users"
COLLECTION_BROADCASTS = "pending_broadcasts"

# Intervallo anti-spam (in secondi)
MESSAGGIO_INTERVALLO = 1.0 
# --- FINE CONFIGURAZIONE ---

# --- CONFIGURAZIONE LOGGING ---
LOG_FILE_NAME = 'broadcast.log' 

log_formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO) 

for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

file_handler = logging.FileHandler(LOG_FILE_NAME)
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO) 
root_logger.addHandler(file_handler)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)
root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)
# --- FINE CONFIGURAZIONE LOGGING ---

# --- INIZIALIZZAZIONE GLOBALE ---
try:
    logger.info("Avvio Broadcast Bot...")
    logger.info("Tentativo di connessione a Firebase...")
    cred = credentials.Certificate(FIREBASE_KEY_FILE)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("Connesso a Firebase con successo!")
    
    bot = telegram.Bot(token=TELEGRAM_TOKEN)
    logger.info(f"Oggetto Bot Telegram inizializzato.")
    
except Exception as e:
    logger.critical(f"Errore critico all'avvio: {e}", exc_info=True)
    sys.exit(1)


def get_all_users():
    """Recupera l'intera anagrafica da Firebase."""
    logger.info("Recupero anagrafica utenti da Firebase...")
    users_ref = db.collection(COLLECTION_UTENTI)
    docs = users_ref.stream()
    user_list = []
    for doc in docs:
        user_list.append(doc.to_dict())
    logger.info(f"Anagrafica caricata: {len(user_list)} utenti trovati.")
    return user_list

def process_broadcast(task_doc_ref, task_data):
    """
    Funzione principale che esegue il lavoro di invio.
    Gira in un thread separato per non bloccare il listener.
    """
    task_id = task_doc_ref.id
    logger.info(f"Avvio elaborazione broadcast task ID: {task_id}")
    
    try:
        testo_messaggio = task_data.get("testo_messaggio")
        target_info = task_data.get("target", {})
        target_type = target_info.get("target_type", "all")
        target_value = target_info.get("target_value")
        
        # Leggi il parse_mode dal task
        parse_mode = task_data.get("parse_mode", None)
        if parse_mode:
             logger.info(f"Rilevata formattazione: {parse_mode}")

        if not testo_messaggio:
            raise ValueError("Testo del messaggio vuoto.")

        # 1. Recupera tutti gli utenti
        all_users = get_all_users()
        recipient_list = []

        # 2. Filtra la lista dei destinatari
        if target_type == "all":
            logger.info(f"Target 'all': selezionati {len(all_users)} utenti.")
            recipient_list = all_users
        
        elif target_type == "group":
            logger.info(f"Target 'group': filtro per gruppo '{target_value}'...")
            for user in all_users:
                user_groups_raw = user.get("gruppo") or 'Nessun Gruppo'
                user_groups_cleaned = [g.strip() for g in user_groups_raw.split(',')]
                if target_value in user_groups_cleaned:
                    recipient_list.append(user)
            logger.info(f"Trovati {len(recipient_list)} utenti nel gruppo.")
            
        elif target_type == "list":
            logger.info(f"Target 'list': filtro per lista ID...")
            target_id_set = set(target_value) 
            for user in all_users:
                if user.get("codice_telegram") in target_id_set:
                    recipient_list.append(user)
            logger.info(f"Trovati {len(recipient_list)} utenti nella lista.")
            
        else:
            raise ValueError(f"Tipo di target non valido: {target_type}")

        if not recipient_list:
            logger.warning("Nessun destinatario trovato per questo broadcast. Task annullato.")
            task_doc_ref.update({"status": "completed_empty"})
            return

        # 3. Loop di invio (LENTO E SICURO)
        logger.info(f"Inizio invio a {len(recipient_list)} destinatari...")
        sent_count = 0
        failed_count = 0
        
        async def send_all():
            nonlocal sent_count, failed_count
            local_bot = telegram.Bot(token=TELEGRAM_TOKEN)
            await local_bot.initialize()
            try:
                for i, user in enumerate(recipient_list):
                    user_id = user.get("codice_telegram")
                    user_name = user.get("nome", "Utente")
                    
                    if not user_id:
                        logger.warning(f"Utente {user_name} non ha un codice_telegram. Salto.")
                        failed_count += 1
                        continue
                        
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
                        
                        logger.info(f"({i+1}/{len(recipient_list)}) Messaggio inviato a {user_name} ({user_id})")
                        sent_count += 1
                        
                        # Pausa anti-spam
                        await asyncio.sleep(MESSAGGIO_INTERVALLO)

                    except telegram.error.RetryAfter as e:
                        wait_time = e.retry_after + 1
                        logger.warning(f"Rate Limit da Telegram. Attesa forzata di {wait_time} secondi...")
                        await asyncio.sleep(wait_time)
                        logger.error(f"FALLITO (RetryAfter) invio a {user_name} ({user_id}): {e}")
                        failed_count += 1
                    
                    except Exception as e:
                        logger.error(f"FALLITO invio a {user_name} ({user_id}): {e}")
                        failed_count += 1
            finally:
                await local_bot.shutdown()

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(send_all())
        finally:
            loop.close()

        # 4. Aggiorna il compito come completato
        logger.info(f"Broadcast completato. Inviati: {sent_count}, Falliti: {failed_count}.")
        task_doc_ref.update({
            "status": "completed",
            "completato_il": datetime.now(timezone.utc),
            "stat_inviati": sent_count,
            "stat_falliti": failed_count
        })

    except Exception as e:
        logger.error(f"Errore grave durante elaborazione task {task_id}: {e}", exc_info=True)
        try:
            task_doc_ref.update({"status": "failed", "error": str(e)})
        except Exception as e_update:
            logger.error(f"Impossibile aggiornare il task {task_id} come 'failed': {e_update}")


def on_broadcast_snapshot(col_snapshot, changes, read_time):
    """
    Ascolta la collezione 'pending_broadcasts'.
    Avvia un nuovo thread per ogni nuovo compito, per non bloccare il listener.
    """
    logger.debug("Snapshot ricevuto da 'pending_broadcasts'...")
    for change in changes:
        if change.type.name == 'ADDED':
            task_doc_ref = change.document.reference
            task_data = change.document.to_dict()
            
            if task_data.get("status") == "pending":
                logger.info(f"Nuovo task di broadcast rilevato: {task_doc_ref.id}")
                
                try:
                    task_doc_ref.update({"status": "processing"})
                except Exception as e:
                    logger.error(f"Impossibile marcare il task {task_doc_ref.id} come 'processing': {e}")
                    continue 

                worker_thread = threading.Thread(
                    target=process_broadcast, 
                    args=(task_doc_ref, task_data)
                )
                worker_thread.start()
            else:
                 logger.debug(f"Task {task_doc_ref.id} ignorato (stato: {task_data.get('status')}).")


def main():
    """Funzione principale. Avvia il listener e attende."""
    try:
        # Avvia il listener per i broadcast
        broadcast_ref = db.collection(COLLECTION_BROADCASTS)
        broadcast_watch = broadcast_ref.on_snapshot(on_broadcast_snapshot)
        logger.info("Listener per 'pending_broadcasts' avviato. In attesa di compiti...")
        
        # Tieni il thread principale vivo
        threading.Event().wait()
        
    except KeyboardInterrupt:
        logger.info("Rilevato Ctrl+C. Chiusura...")
    except Exception as e:
        logger.critical(f"Errore irreversibile nel main: {e}", exc_info=True)
    finally:
        logger.info("Chiusura dello script.")
        
if __name__ == "__main__":
    main()
