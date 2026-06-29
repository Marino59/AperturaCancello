import logging
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone, timedelta
import time
import threading 
import sys 
import socket
import asyncio 
from telegram import Update
from telegram.error import NetworkError
from telegram.ext import Application, MessageHandler, filters, ContextTypes
from rpi_rf import RFDevice 

# Prova a importare GPIO
try:
    import RPi.GPIO as GPIO
    GPIO_LIB_FOUND = True
except ImportError:
    GPIO_LIB_FOUND = False
    print("Avviso: Libreria RPi.GPIO non trovata. Il relè funzionerà solo in simulazione.")

# --- CONFIGURAZIONE ---

#TELEGRAM_TOKEN = "6854706513:AAHOx8vtVGeXQj5d1FhVu66dXnv2fewlu8o" # <-- TOKEN PROVACANCELLO
TELEGRAM_TOKEN = "6091643642:AAGT8OPv6Ukh637E3_ULPCx3pnWTaWRxYX8" # <-- TOKEN SANGIULIANO$
FIREBASE_KEY_FILE = "serviceAccountKey.json"

# Nomi delle Collezioni
COLLECTION_UTENTI = "authorized_users"
COLLECTION_LOGS = "gate_logs"
COLLECTION_GARAGE = "garage_mapping" 
COLLECTION_PENDING_WELCOMES = "pending_welcomes"
COLLECTION_MESSAGES = "message_templates"
COLLECTION_TIMER = "timer_settings"
COLLECTION_HOLIDAYS = "holidays"
COLLECTION_ADMIN_COMMANDS = "admin_commands" 
DOCUMENT_ID_SCHEDULE = "schedule" 
# --- FINE COLLEZIONI ---

# --- CONFIGURAZIONE PIN HARDWARE (TUTTI QUI) ---
GPIO_PIN_TX = 18                # Trasmettitore RF (Garage) 
GPIO_PIN_RELAIS_GATE = 12       # Relè 1: Impulso Telegram
GPIO_PIN_RELAIS_TIMER = 23      # Relè 2: Timer/Fail-safe
GPIO_PIN_LED_HEARTBEAT = 25     # LED Verde (Battito)
GPIO_PIN_LED_NETWORK = 24       # LED Blu (Rete OK)
GPIO_PIN_LED_TIMER = 16         # LED Rosso (Timer Attivo)
# --- FINE CONFIGURAZIONE PIN ---

# --- CODICI RF PRESA E TIMER ---
OUTLET_ON_CODE = 3532225
OUTLET_OFF_CODE = 3532226
OUTLET_AUTO_OFF_DELAY = 2 * 60 * 60 # 2 ore in secondi
# --- FINE CODICI RF ---

# Configurazione Health Check
HEALTH_CHECK_INTERVALLO_SEC = 15 
HEALTH_CHECK_TIMEOUT_SEC = 5.0 
LOOP_TIMER_INTERVALLO = 60 # Intervallo loop timer (60 sec)

# CONFIGURAZIONE FAILSAFE TELEGRAM
TELEGRAM_TIMEOUT_SEC = 130  # Se non sentiamo Telegram per 130 secondi, apri tutto.
# --- FINE CONFIGURAZIONE ---

# --- CONFIGURAZIONE LOGGING (CORRETTA) ---
LOG_FILE_NAME = 'error.log' 
log_formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG) 

# Rimuovi handler precedenti per evitare duplicati
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# FILE: Solo errori gravi (WARNING)
file_handler = logging.FileHandler(LOG_FILE_NAME)
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.WARNING) 
root_logger.addHandler(file_handler)

# CONSOLE: Informazioni utili (INFO) <-- QUI ERA IL PROBLEMA
console_handler = logging.StreamHandler(sys.stdout) 
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO) 
root_logger.addHandler(console_handler)

# ZITTISCI LIBRERIE ESTERNE (Mantieni CRITICAL per evitare spam se manca internet)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)
logging.getLogger("telegram.ext").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
# --- FINE CONFIGURAZIONE LOGGING ---

# Variabili globali
application = None 
rf_device = None 

# --- VARIABILI PER IL BATTITO TELEGRAM ---
last_telegram_ok_time = time.time()
telegram_status_lock = threading.Lock() 
is_telegram_online = True 
telegram_offline_start_time = None 
# --- FINE GLOBALI ---

# --- VARIABILI E AZIONI PER LA PRESA (OUTLET) ---
outlet_off_timer = None
outlet_timer_lock = threading.Lock()

def auto_off_outlet():
    global outlet_off_timer
    logger.info("Timer auto-spegnimento presa scaduto. Spegnimento...")
    # Cerchiamo il codice P1 nella cache per calcolare lo spegnimento
    with cache_lock:
        base_code = garage_codes_cache.get("P1", OUTLET_ON_CODE)
    
    trasmetti_codice(base_code + 1)
    
    log_payload = {
        "timestamp": datetime.now(timezone.utc), 
        "telegram_id": "SYSTEM", 
        "telegram_nome": "Sistema", 
        "gruppo_utente": "Sistema",
        "garage_richiesto": "Presa", 
        "status": "success", 
        "messaggio": "Presa spenta automaticamente (Timer 2 ore)"
    }
    try:
        db_add_log_sync(log_payload)
    except:
        pass

    with outlet_timer_lock:
        outlet_off_timer = None

def outlet_on_action(codice_on, user_name, telegram_id="ADMIN_WEB", group="Admin"):
    """Esegue l'accensione della presa e avvia il timer di 2 ore."""
    global outlet_off_timer
    logger.info(f"Azione Accensione Presa per {user_name} (ID: {telegram_id}).")
    trasmetti_codice(codice_on)
    
    with outlet_timer_lock:
        if outlet_off_timer:
            outlet_off_timer.cancel()
        outlet_off_timer = threading.Timer(OUTLET_AUTO_OFF_DELAY, auto_off_outlet)
        outlet_off_timer.start()
        logger.info("Timer auto-spegnimento (2h) avviato.")
    
    log_payload = {
        "timestamp": datetime.now(timezone.utc), 
        "telegram_id": telegram_id, 
        "telegram_nome": user_name, 
        "gruppo_utente": group,
        "garage_richiesto": "Presa", 
        "status": "success", 
        "messaggio": "Presa accesa (Timer 2 ore)"
    }
    db_add_log_sync(log_payload)

def outlet_off_action(codice_off, user_name, telegram_id="ADMIN_WEB", group="Admin"):
    """Esegue lo spegnimento della presa e annulla il timer."""
    global outlet_off_timer
    logger.info(f"Azione Spegnimento Presa per {user_name} (ID: {telegram_id}).")
    trasmetti_codice(codice_off)
    
    with outlet_timer_lock:
        if outlet_off_timer:
            outlet_off_timer.cancel()
            outlet_off_timer = None
            logger.info("Timer auto-spegnimento cancellato.")
    
    log_payload = {
        "timestamp": datetime.now(timezone.utc), 
        "telegram_id": telegram_id, 
        "telegram_nome": user_name, 
        "gruppo_utente": group,
        "garage_richiesto": "Presa", 
        "status": "success", 
        "messaggio": "Presa spenta manualmente"
    }
    db_add_log_sync(log_payload)
# --- FINE AZIONI PRESA ---

# --- INIZIALIZZAZIONE FIREBASE ---
try:
    logger.info("Avvio Super-Bot (Gate + Timer)...")
    logger.info("Tentativo di connessione a Firebase...")
    cred = credentials.Certificate(FIREBASE_KEY_FILE)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("Connesso a Firebase con successo!")
except Exception as e:
    logger.critical(f"Errore critico all'avvio: {e}", exc_info=True)
    sys.exit(1) 

# --- GESTIONE CACHE E LOCK ---
garage_codes_cache = {}
message_templates_cache = {} 
schedule_cache = {}
holidays_cache = set() 
cache_lock = threading.Lock() 

# Lock per prevenire conflitti (race conditions) sul controllo del timer
timer_lock = threading.Lock()

cache_ready_garage = threading.Event()
cache_ready_messages = threading.Event() 
cache_ready_schedule = threading.Event()
cache_ready_holidays = threading.Event()
gpio_ready_event = threading.Event() # Sincronizzazione GPIO

def on_garage_snapshot(col_snapshot, changes, read_time):
    global garage_codes_cache
    with cache_lock:
        new_cache = {}
        for doc in col_snapshot:
            data = doc.to_dict()
            if 'garage_id' in data and 'radio_code' in data:
                new_cache[data['garage_id']] = data['radio_code']
        garage_codes_cache = new_cache
        logger.info(f"Cache garage aggiornata: {len(garage_codes_cache)} voci caricate.")
    if not cache_ready_garage.is_set():
        logger.info("Cache garage pronta.")
        cache_ready_garage.set()

def on_message_snapshot(col_snapshot, changes, read_time):
    global message_templates_cache
    with cache_lock:
        new_cache = {}
        for doc in col_snapshot:
            data = doc.to_dict()
            if 'text' in data:
                new_cache[doc.id] = data['text'] 
        message_templates_cache = new_cache
        logger.info(f"Mappa messaggi aggiornata: {len(message_templates_cache)} voci caricate.")
    if not cache_ready_messages.is_set():
        logger.info("Cache messaggi pronta.")
        cache_ready_messages.set()

def on_schedule_snapshot(doc_snapshot, changes, read_time):
    global schedule_cache
    logger.debug("-> LISTENER ORARI: Snapshot ricevuto.")
    cache_was_ready = cache_ready_schedule.is_set()
    
    with cache_lock:
        if doc_snapshot and doc_snapshot[0].exists:
            new_schedule = doc_snapshot[0].to_dict() 
            if new_schedule != schedule_cache:
                schedule_cache = new_schedule
                logger.info(f"Cache orari aggiornata: {schedule_cache}")
            else:
                logger.debug("-> LISTENER ORARI: Dati orari identici, nessun aggiornamento.")
                if not cache_was_ready:
                    cache_ready_schedule.set()
                return 
        else:
            logger.warning("Documento 'schedule' non trovato. Uso cache vuota.")
            schedule_cache = {}
            
    if not cache_was_ready:
        logger.info("Cache orari pronta (primo avvio).")
        cache_ready_schedule.set()
    else:
        logger.info("-> LISTENER ORARI: Rilevato aggiornamento da React. FORZO RICALCOLO IMMEDIATO.")
        run_timer_check_safely("LISTENER")

def on_holidays_snapshot(col_snapshot, changes, read_time):
    global holidays_cache
    logger.debug("-> LISTENER FESTIVI: Snapshot ricevuto.")
    with cache_lock:
        new_set = set()
        for doc in col_snapshot:
            data = doc.to_dict()
            if 'date_string' in data:
                new_set.add(data['date_string'])
        holidays_cache = new_set
        logger.info(f"Cache festività aggiornata: {len(holidays_cache)} regole caricate.")
    if not cache_ready_holidays.is_set():
        logger.info("Cache festività pronta.")
        cache_ready_holidays.set()

def get_message(key, replacements=None):
    with cache_lock:
        template = message_templates_cache.get(key, f"ERRORE: Template '{key}' non trovato.")
    if replacements:
        for var, value in replacements.items():
            template = template.replace(f"{{{var}}}", str(value))
    return template
# --- FINE CACHE ---


# --- FUNZIONI HARDWARE (UNIFICATE) ---
def setup_gpio():
    """Imposta TUTTI i pin GPIO una sola volta all'avvio."""
    logger.debug("-> setup_gpio: Inizio setup GPIO...")
    if not GPIO_LIB_FOUND: 
        logger.warning("-> setup_gpio: Libreria RPi.GPIO non trovata, salto setup.")
        gpio_ready_event.set() # Simulazione pronta
        return
    try:
        GPIO.cleanup() 
        GPIO.setmode(GPIO.BCM)
        logger.debug("-> setup_gpio: Modalità BCM impostata.")
        
        GPIO.setup(GPIO_PIN_RELAIS_GATE, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(GPIO_PIN_RELAIS_TIMER, GPIO.OUT, initial=GPIO.HIGH)
        GPIO.setup(GPIO_PIN_LED_HEARTBEAT, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(GPIO_PIN_LED_NETWORK, GPIO.OUT, initial=GPIO.HIGH) 
        GPIO.setup(GPIO_PIN_LED_TIMER, GPIO.OUT, initial=GPIO.LOW)
        
        logger.info("-> setup_gpio: Setup GPIO completato.")
        gpio_ready_event.set() # <-- Segnala che il GPIO è pronto
        
    except Exception as e:
        logger.error(f"Errore CRITICO durante il setup GPIO iniziale: {e}")
        sys.exit(1) 

def set_gate_relay_impulse():
    """Attiva il relè del cancello (Telegram) per 1 secondo."""
    if not GPIO_LIB_FOUND:
        logger.info(f"*** SIMULAZIONE HARDWARE: Impulso 1s su Rele Pin {GPIO_PIN_RELAIS_GATE} ***")
        return
    try:
        GPIO.output(GPIO_PIN_RELAIS_GATE, GPIO.HIGH)
        time.sleep(1)
        GPIO.output(GPIO_PIN_RELAIS_GATE, GPIO.LOW)
    except Exception as e:
        logger.error(f"*** ERRORE HARDWARE RELÈ GATE durante impulso: {e} ***")


def set_timer_relay_state(stato):
    if not GPIO_LIB_FOUND:
        stato_str = "HIGH (CHIUSO)" if stato == 1 else "LOW (APERTO)"
        logger.info(f"*** SIMULAZIONE TIMER: Rele Pin {GPIO_PIN_RELAIS_TIMER} e LED Pin {GPIO_PIN_LED_TIMER} impostati su {stato_str} ***")
        return

    try:
        if stato == GPIO.HIGH: # CHIUDI
            GPIO.output(GPIO_PIN_RELAIS_TIMER, GPIO.HIGH)
            GPIO.output(GPIO_PIN_LED_TIMER, GPIO.LOW) 
        elif stato == GPIO.LOW: # APRI
            GPIO.output(GPIO_PIN_RELAIS_TIMER, GPIO.LOW)
            GPIO.output(GPIO_PIN_LED_TIMER, GPIO.HIGH) 
    except Exception as e:
        logger.error(f"*** ERRORE HARDWARE TIMER durante impostazione stato: {e} ***")

def trasmetti_codice(entry_codice):
    global rf_device 
    if not rf_device:
        logger.error(f"*** ERRORE HARDWARE RF: rf_device non inizializzato. ***")
        return
    try:
        codice = int(entry_codice)
        rf_device.enable_tx()
        rf_device.tx_code(codice, 1, 350, 24) 
        rf_device.disable_tx()
        logger.info(f"*** HARDWARE RF: Inviato codice radio: {codice} ***")
    except Exception as e:
        logger.error(f"*** ERRORE HARDWARE RF: {e} ***")
# --- FINE FUNZIONI HARDWARE ---


# --- FUNZIONI DATABASE SINCRONE ---
def db_add_log_sync(payload):
    # Aggiungiamo un try/except qui per evitare blocchi se manca internet
    try:
        write_result = db.collection(COLLECTION_LOGS).add(payload)
        write_result[1].get() 
        return write_result[1].id
    except Exception as e:
        # Se fallisce la scrittura (es. no internet), lo stampiamo a console
        print(f"!!! FALLITA SCRITTURA LOG SU FIREBASE (Probabile NO Internet): {e}")
        raise e

def db_get_user_sync(user_id_str):
    users_ref = db.collection(COLLECTION_UTENTI)
    query = users_ref.where("codice_telegram", "==", user_id_str).limit(1)
    results = list(query.stream())
    if not results: return None, None
    return results[0].reference, results[0].to_dict()

def db_update_user_sync(user_doc_ref, update_payload):
    user_doc_ref.update(update_payload)
    
def db_delete_doc_sync(doc_ref):
    doc_ref.delete()
# --- FINE FUNZIONI DATABASE ---


# --- THREAD 1: HEALTH CHECK ---
is_currently_connected = True 
connection_lock = threading.Lock() 
offline_start_time = None 

def log_system_event(status, messaggio, timestamp):
    try:
        log_payload = { 
            "timestamp": timestamp, "status": status, "messaggio": messaggio, 
            "telegram_id": "SYSTEM", "telegram_nome": "Sistema", "gruppo_utente": "Sistema"
        }
        log_id = db_add_log_sync(log_payload) 
        logger.info(f"Log di sistema: {status} (ID: {log_id})")
    except Exception as e:
        # Non intasiamo il log, l'errore è già stampato in db_add_log_sync
        pass

def check_connection_status():
    global is_currently_connected, offline_start_time
    connection_ok = False
    
    try:
        socket.setdefaulttimeout(HEALTH_CHECK_TIMEOUT_SEC)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("8.8.8.8", 53)) 
        s.close()
        connection_ok = True
    except (socket.error, socket.timeout):
        connection_ok = False
    
    with connection_lock:
        if connection_ok:
            if not is_currently_connected: 
                logger.info("CONNESSIONE INTERNET RIPRISTINATA.")
                if GPIO_LIB_FOUND: GPIO.output(GPIO_PIN_LED_NETWORK, GPIO.HIGH) 
                
                now = datetime.now(timezone.utc)
                messaggio_online = "Connessione Internet ripristinata."
                if offline_start_time:
                    try:
                        duration = now - offline_start_time
                        duration_str = str(duration).split('.')[0] 
                        messaggio_online = f"Connessione ripristinata dopo {duration_str}."
                        log_system_event('system_offline', 'Connessione Internet persa.', offline_start_time)
                    except Exception: pass
                    offline_start_time = None 
                
                log_system_event('system_online', messaggio_online, now)
                
            is_currently_connected = True
        else:
            if is_currently_connected: 
                logger.warning("CONNESSIONE INTERNET PERSA.") 
                if GPIO_LIB_FOUND: GPIO.output(GPIO_PIN_LED_NETWORK, GPIO.LOW) 
                if not offline_start_time: offline_start_time = datetime.now(timezone.utc)

            is_currently_connected = False

def health_check_loop():
    # Attende che GPIO sia pronto prima di partire (corregge errore avvio)
    gpio_ready_event.wait()
    logger.info("Thread Health Check avviato.")
    while True:
        try:
            check_connection_status()
            time.sleep(HEALTH_CHECK_INTERVALLO_SEC)
        except Exception:
            time.sleep(HEALTH_CHECK_INTERVALLO_SEC * 2)
# --- FINE THREAD 1 ---


# --- THREAD 2: LED HEARTBEAT ---
def heartbeat_loop():
    # Attende che GPIO sia pronto prima di partire (corregge errore avvio)
    gpio_ready_event.wait()
    logger.info(f"Thread Heartbeat LED avviato.")
    while True:
        try:
            GPIO.output(GPIO_PIN_LED_HEARTBEAT, GPIO.HIGH)
            time.sleep(0.5) 
            GPIO.output(GPIO_PIN_LED_HEARTBEAT, GPIO.LOW)
            time.sleep(1.5) 
        except Exception as e:
            # Se siamo qui, il GPIO non è ancora settato o è successo qualcosa di strano
            time.sleep(2)
# --- FINE THREAD 2 ---


# --- THREAD 3: TIMER LOGIC ---
current_timer_relay_state = GPIO.HIGH if GPIO_LIB_FOUND else None

def check_timer_logic(caller="SCONOSCIUTO"):
    global current_timer_relay_state, is_currently_connected, last_telegram_ok_time, is_telegram_online, telegram_offline_start_time
    
    with cache_lock:
        schedule = schedule_cache.copy()
        holidays = holidays_cache.copy()

    if not schedule: return

    now = datetime.now()
    ora_corrente_str = now.strftime("%H:%M")

    # --- 1. Controllo Internet ---
    with connection_lock:
        internet_down = not is_currently_connected
        
    # --- 2. Controllo Telegram ---
    telegram_down = False
    with telegram_status_lock:
        elapsed_telegram = time.time() - last_telegram_ok_time
        
        if elapsed_telegram > TELEGRAM_TIMEOUT_SEC:
            telegram_down = True
            # Logga solo se lo stato cambia
            if is_telegram_online:
                is_telegram_online = False
                telegram_offline_start_time = datetime.now(timezone.utc) # Segna ora inizio problema
                
                print("!!! TELEGRAM OFFLINE RILEVATO !!!") # Stampo a console per debug immediato
                logger.warning(f"-> TIMER: Telegram Timeout ({elapsed_telegram:.1f}s).")
                # Tentiamo di scrivere il log, ma se manca internet fallirà (è normale)
                log_system_event('system_warning', 'Telegram irraggiungibile. Attivazione Fail-Safe.', datetime.now(timezone.utc))
        else:
            if not is_telegram_online:
                is_telegram_online = True
                logger.info("-> TIMER: Telegram ripristinato.")
                
                # LOG POSTUMO: Calcoliamo quanto è stato giù
                messaggio_recupero = "Connessione Telegram ripristinata."
                if telegram_offline_start_time:
                    try:
                        duration = datetime.now(timezone.utc) - telegram_offline_start_time
                        duration_str = str(duration).split('.')[0]
                        messaggio_recupero = f"Telegram ripristinato (Offline per {duration_str})."
                    except Exception: pass
                    telegram_offline_start_time = None
                
                log_system_event('system_info', messaggio_recupero, datetime.now(timezone.utc))

    # --- LOGICA FAIL SAFE ---
    if internet_down:
        logger.warning("-> check_timer_logic: FAIL-SAFE: Internet è assente. Forza apertura (LOW).")
        target_state = GPIO.LOW 
    elif telegram_down:
        logger.warning("-> check_timer_logic: FAIL-SAFE: Telegram non risponde. Forza apertura (LOW).")
        target_state = GPIO.LOW
    else:
        # Tutto OK, logica normale
        oggi_weekday = now.weekday() 
        data_corrente_str = now.strftime("%d/%m/%Y") 
        data_ricorrente_str = now.strftime("%d/%m/*") 
        target_state = GPIO.HIGH # Default: CHIUSO
        
        if oggi_weekday == 6: # Domenica
            target_state = GPIO.HIGH
        elif data_corrente_str in holidays or data_ricorrente_str in holidays: # Festivo
            target_state = GPIO.HIGH
        elif oggi_weekday == 5: # Sabato
            ap = schedule.get('sabato_apertura'); ch = schedule.get('sabato_chiusura')
            if ap and ch and ap <= ora_corrente_str < ch: target_state = GPIO.LOW 
        elif 0 <= oggi_weekday <= 4: # Feriale
            ap = schedule.get('feriali_apertura'); ch = schedule.get('feriali_chiusura')
            if ap and ch and ap <= ora_corrente_str < ch: target_state = GPIO.LOW 

    if target_state != current_timer_relay_state:
        stato_target_str = "APERTO (LOW)" if target_state == GPIO.LOW else "CHIUSO (HIGH)"
        logger.info(f"-> TIMER: CAMBIO STATO! Nuovo: {stato_target_str} (Causa: {caller})")
        set_timer_relay_state(target_state) 
        current_timer_relay_state = target_state 

def run_timer_check_safely(caller="SCONOSCIUTO"):
    with timer_lock:
        try: check_timer_logic(caller)
        except Exception as e: logger.error(f"Errore TIMER: {e}")

def timer_loop():
    # Attende che GPIO sia pronto
    gpio_ready_event.wait()
    logger.info("Thread Logica Timer avviato.")
    cache_ready_schedule.wait(); cache_ready_holidays.wait()
    
    while True:
        try:
            time.sleep(LOOP_TIMER_INTERVALLO)
            run_timer_check_safely("TIMER_LOOP")
        except Exception:
            time.sleep(LOOP_TIMER_INTERVALLO * 2) 
# --- FINE THREAD 3 ---

# --- THREAD 4: LISTENER ADMIN ---
def on_admin_command_snapshot(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name == 'ADDED':
            try:
                data = change.document.to_dict()
                if data.get('command') == 'open_gate':
                    logger.info(f"Comando Admin Web ricevuto.")
                    set_gate_relay_impulse()
                    log_payload = {
                        "timestamp": datetime.now(timezone.utc), "telegram_id": "ADMIN_WEB", 
                        "telegram_nome": data.get('admin_email', 'Admin'), "gruppo_utente": "Admin",
                        "garage_richiesto": "Cancello", "status": "success", "messaggio": "Aperto da Web"
                    }
                    db_add_log_sync(log_payload)
                
                elif data.get('command') == 'outlet_on':
                    with cache_lock:
                        code = garage_codes_cache.get("P1", OUTLET_ON_CODE)
                    outlet_on_action(code, data.get('admin_email', 'Admin'))

                elif data.get('command') == 'outlet_off':
                    with cache_lock:
                        code = garage_codes_cache.get("P1", OUTLET_ON_CODE) + 1
                    outlet_off_action(code, data.get('admin_email', 'Admin'))

                change.document.reference.delete()
            except Exception as e: logger.error(f"Errore Admin Cmd: {e}")
# --- FINE THREAD 4 ---


# --- GESTIONE MESSAGGI DI BENVENUTO ---
async def send_welcome_message(context: ContextTypes.DEFAULT_TYPE):
    job_data = context.job.data
    telegram_id = job_data.get('telegram_id')
    nome = job_data.get('nome')

    if not telegram_id or not nome:
        logger.error(f"Job di benvenuto non valido, dati mancanti: {job_data}")
        return
    messaggio = get_message("welcome_new_user", {"nome": nome})
    try:
        await context.bot.send_message(chat_id=telegram_id, text=messaggio)
        logger.info(f"Messaggio di benvenuto inviato a: {nome}")
    except Exception as e:
        logger.error(f"Impossibile inviare messaggio di benvenuto a {telegram_id}: {e}")
# --- FINE GESTIONE BENVENUTO ---

# --- JOB DI HEARTBEAT TELEGRAM ---
async def telegram_heartbeat_job(context: ContextTypes.DEFAULT_TYPE):
    global last_telegram_ok_time
    try:
        await context.bot.get_me() 
        with telegram_status_lock: last_telegram_ok_time = time.time()
    except Exception: pass # Ignoriamo errori qui, ci pensa il timer loop a controllare il tempo
# --- FINE JOB ---


# --- GESTIONE MESSAGGI ---
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
    logger.info(f"Msg da {user.first_name}: {msg}")
    
    log_payload = {
        "timestamp": datetime.now(timezone.utc), "telegram_id": uid, 
        "telegram_nome": user.first_name or "",
        "telegram_cognome": user.last_name or "",
        "testo_ricevuto": msg, "garage_richiesto": "Cancello",
        "status": "", "gruppo_utente": "Sconosciuto"
    }

    try:
        _, user_data = await asyncio.to_thread(db_get_user_sync, uid)
        if not user_data:
            await update.message.reply_text(get_message("auth_denied"))
            log_payload["status"] = "failed_unauthorized"; await asyncio.to_thread(db_add_log_sync, log_payload)
            return

        log_payload["gruppo_utente"] = user_data.get('gruppo', 'N/D')
        msg_upper = msg.upper()
        
        # Controllo Date
        d_ini = user_data.get("data_inizio"); d_fin = user_data.get("data_fine"); now = datetime.now(timezone.utc)
        if not d_ini or (d_ini > now) or (d_fin and now > d_fin):
            await update.message.reply_text(get_message("auth_expired"))
            log_payload["status"] = "failed_dates"; await asyncio.to_thread(db_add_log_sync, log_payload)
            return

        # --- LOGICA COMANDI ---
        if msg_upper == "P1":
            with cache_lock:
                codice_on = garage_codes_cache.get("P1")
            
            # Verifica se l'utente ha "P1" tra i suoi garage autorizzati
            if codice_on and "P1" in user_data.get('garage', '').split(','):
                await asyncio.to_thread(outlet_on_action, codice_on, user.first_name, uid, log_payload["gruppo_utente"])
                await update.message.reply_text(get_message("auth_success", {"nome": user_data.get('nome'), "tipo_apertura": "Presa P1 (Timer 2h)"}))
                return # Log già eseguito da outlet_on_action
            else:
                await update.message.reply_text("Non sei autorizzato a comandare la Presa P1.")
                log_payload["status"] = "failed_unauthorized_p1"
                await asyncio.to_thread(db_add_log_sync, log_payload)
                return

        # Apertura Garage o Cancello
        if msg in garage_codes_cache and msg != "0":
            # Garage specifico
            if msg in user_data.get('garage', '').split(','):
                trasmetti_codice(garage_codes_cache[msg])
                await update.message.reply_text(get_message("auth_success", {"nome": user_data.get('nome'), "tipo_apertura": f"Garage {msg}"}))
                log_payload["status"] = "success"; log_payload["garage_richiesto"] = msg
            else:
                await asyncio.to_thread(set_gate_relay_impulse) # Fallback
        else:
            # Cancello default
            await asyncio.to_thread(set_gate_relay_impulse)
            await update.message.reply_text(get_message("auth_success", {"nome": user_data.get('nome'), "tipo_apertura": "Cancello"}))
            log_payload["status"] = "success"

        await asyncio.to_thread(db_add_log_sync, log_payload)

    except Exception as e:
        logger.error(f"Errore msg: {e}")
        try: await update.message.reply_text("Errore interno.")
        except: pass


# --- MAIN ---
def main() -> None:
    global application, current_timer_relay_state, rf_device
    
    garage_watch = None; welcome_watch = None; message_watch = None 
    schedule_watch = None; holidays_watch = None; admin_commands_watch = None 
    
    try:
        logger.info("Avvio MAIN...")
        setup_gpio() # GPIO Ready viene settato qui dentro se tutto ok

        if GPIO_LIB_FOUND:
            rf_device = RFDevice(GPIO_PIN_TX)

        # Firebase Listeners
        garage_watch = db.collection(COLLECTION_GARAGE).on_snapshot(on_garage_snapshot)
        message_watch = db.collection(COLLECTION_MESSAGES).on_snapshot(on_message_snapshot)
        schedule_watch = db.collection(COLLECTION_TIMER).document(DOCUMENT_ID_SCHEDULE).on_snapshot(on_schedule_snapshot)
        holidays_watch = db.collection(COLLECTION_HOLIDAYS).on_snapshot(on_holidays_snapshot)
        admin_commands_watch = db.collection(COLLECTION_ADMIN_COMMANDS).on_snapshot(on_admin_command_snapshot)

        # Threads
        threading.Thread(target=health_check_loop, daemon=True).start()
        threading.Thread(target=heartbeat_loop, daemon=True).start()
        threading.Thread(target=timer_loop, daemon=True).start()

        logger.info("Attesa Cache...")
        cache_ready_garage.wait(60); cache_ready_messages.wait(60)
        cache_ready_schedule.wait(60); cache_ready_holidays.wait(60)
             
        # Stato iniziale
        try:
            run_timer_check_safely("MAIN")
        except:
            with timer_lock: set_timer_relay_state(GPIO.HIGH)

        # Bot Telegram
        application = Application.builder().token(TELEGRAM_TOKEN).build()
        application.add_handler(MessageHandler(filters.TEXT | filters.COMMAND, gestisci_messaggio))
        if application.job_queue:
            application.job_queue.run_repeating(telegram_heartbeat_job, interval=60, first=10)

        # Welcome Listener
        def on_welcome(col, chg, rt):
            for c in chg:
                if c.type.name == 'ADDED':
                    d = c.document.to_dict()
                    telegram_id = d.get('telegram_id')
                    nome = d.get('nome')
                    if telegram_id and nome and application and application.job_queue:
                        logger.info(f"DEBUG: Scheduling welcome msg for {nome} ({telegram_id})")
                        try:
                            job_data = {'telegram_id': telegram_id, 'nome': nome}
                            application.job_queue.run_once(send_welcome_message, 0, data=job_data, name=f"welcome_{telegram_id}")
                            logger.info("DEBUG: Job scheduled successfully")
                        except Exception as e:
                            logger.error(f"DEBUG: Error scheduling job: {e}")
                    else:
                        logger.error(f"DEBUG: Missing data or job_queue. tid={telegram_id}, nome={nome}, app={application}, jq={application.job_queue if application else 'None'}")
                    c.document.reference.delete()
        
        welcome_watch = db.collection(COLLECTION_PENDING_WELCOMES).on_snapshot(on_welcome)

        # --- MODIFICA AGGIUNTA: ASCOLTO NUOVI UTENTI AUTORIZZATI ---
        def on_users_snapshot(col_snapshot, changes, read_time):
            for change in changes:
                if change.type.name == 'ADDED':
                    try:
                        doc = change.document
                        # Controllo anti-spam: se il documento è vecchio (es. caricamento iniziale), ignoralo.
                        # Usa create_time se disponibile.
                        create_time = doc.create_time
                        if create_time:
                            now = datetime.now(timezone.utc)
                            # create_time è datetime con timezone
                            diff = now - create_time
                            if diff.total_seconds() > 300: # 5 minuti
                                # Utente vecchio, ignora
                                continue
                        
                        # È un utente NUOVO (o creato < 5 min fa)
                        d = doc.to_dict()
                        telegram_id = d.get('codice_telegram')
                        nome = d.get('nome')
                        
                        if telegram_id and nome and application and application.job_queue:
                            logger.info(f"NUOVO UTENTE RILEVATO: {nome} (ID: {telegram_id}). Invio benvenuto...")
                            job_data = {'telegram_id': telegram_id, 'nome': nome}
                            application.job_queue.run_once(send_welcome_message, 0, data=job_data, name=f"welcome_user_{telegram_id}")

                    except Exception as e:
                        logger.error(f"Errore nel listener nuovi utenti: {e}")

        # Registra il listener sulla collezione UTENTI
        users_watch = db.collection(COLLECTION_UTENTI).on_snapshot(on_users_snapshot)
        # ------------------------------------------------------------

        logger.info("Polling Telegram...")
        
        # Loop principale robusto anti-crash
        while True:
            try:
                application.run_polling()
                break 
            except NetworkError:
                # Zittito dal logging.CRITICAL, ma attendiamo prima di riprovare
                time.sleep(15)
            except Exception as e:
                logger.critical(f"Errore Polling: {e}")
                time.sleep(30)
        
    except KeyboardInterrupt:
        logger.info("Stop da tastiera.")
    finally:
        if application and application.running: application.stop_polling()
        if rf_device: rf_device.cleanup()
        if GPIO_LIB_FOUND: GPIO.cleanup()
        logger.info("Terminato.")

if __name__ == "__main__":
    main()
