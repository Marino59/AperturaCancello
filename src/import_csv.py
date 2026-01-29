import csv
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone

# --- CONFIGURAZIONE ---
CSV_FILE_PATH = 'AnaTelegram (4).csv'  # Assicurati che il nome sia corretto
FIREBASE_KEY_FILE = 'serviceAccountKey.json'
COLLECTION_UTENTI = 'authorized_users'
DATE_FORMAT = '%d/%m/%y'  # Formato GG/MM/AA (anno a 2 cifre)
# --- MODIFICA: Delimitatore forzato ---
DELIMITATORE_CSV = ',' # Forziamo la VIRGOLA come da tua indicazione
# ------------------------------------

# --- INIZIALIZZAZIONE FIREBASE ---
try:
    print(f"Tentativo di connessione a Firebase con {FIREBASE_KEY_FILE}...")
    cred = credentials.Certificate(FIREBASE_KEY_FILE)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Connesso a Firebase con successo!")
except Exception as e:
    print(f"ERRORE CRITICO: Impossibile connettersi a Firebase: {e}")
    exit(1)

# --- FUNZIONE PER CONVERTIRE LE DATE ---
def parse_date_to_timestamp(date_str, is_end_date=False):
    """Converte una stringa GG/MM/AA in un Timestamp Firebase UTC."""
    if not date_str:
        return None  # Ritorna None se la data è vuota

    try:
        # Interpreta la data GG/MM/AA
        dt_naive = datetime.strptime(date_str, DATE_FORMAT)

        # Per la data di fine, impostiamo l'orario alle 23:59:59
        if is_end_date:
            dt_naive = dt_naive.replace(hour=23, minute=59, second=59)
        # Per la data di inizio, l'orario di default è 00:00:00

        # Converte in UTC (lo standard per Firebase)
        dt_aware_utc = dt_naive.astimezone(timezone.utc)
        return dt_aware_utc # Firebase accetta direttamente datetime UTC aware

    except ValueError:
        print(f"  ATTENZIONE: Formato data non valido '{date_str}', verrà impostato a None.")
        return None

# --- ELABORAZIONE DEL CSV ---
print(f"Inizio elaborazione del file CSV: {CSV_FILE_PATH}...")
print(f"Leggendo come CSV SENZA INTESTAZIONE, delimitatore '{DELIMITATORE_CSV}'")
utenti_importati = 0
utenti_saltati = 0

try:
    with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as csvfile:
        # --- MODIFICA: Usiamo csv.reader (NON DictReader) ---
        reader = csv.reader(csvfile, delimiter=DELIMITATORE_CSV)

        for i, row in enumerate(reader):
            line_num = i + 1 # Le righe ora partono da 1
            
            try:
                # --- MODIFICA: Lettura posizionale ---
                # Ordine: Nome,cognome,garage,id telegram,gruppo,data inizio,datra fine,commento
                
                # Controllo base: la riga deve avere almeno 4 colonne (fino a ID Telegram)
                if len(row) < 4:
                    print(f"\nERRORE riga {line_num}: riga troppo corta. Saltata.")
                    utenti_saltati += 1
                    continue

                nome = row[0].strip()
                cognome = row[1].strip()
                garage = row[2].strip().replace(' ', ',') # Sostituisci spazi
                telegram_id = row[3].strip()
                
                # Gestione colonne opzionali (se la riga è più corta)
                gruppo = row[4].strip() if len(row) > 4 else ''
                data_inizio_str = row[5].strip() if len(row) > 5 else ''
                data_fine_str = row[6].strip() if len(row) > 6 else ''
                commento = row[7].strip() if len(row) > 7 else ''
                
                print(f"\nElaborazione riga {line_num}: ID {telegram_id}, Nome {nome}...")

                # --- VALIDAZIONE ESSENZIALE ---
                if not telegram_id:
                    print(f"  ERRORE: IDTelegram (colonna 4) mancante. Riga saltata.")
                    utenti_saltati += 1
                    continue
                 
                # --- CONVERSIONE DATE ---
                data_inizio_ts = parse_date_to_timestamp(data_inizio_str, is_end_date=False)
                data_fine_ts = parse_date_to_timestamp(data_fine_str, is_end_date=True)
                
                # --- PREPARAZIONE PAYLOAD PER FIREBASE ---
                user_data = {
                    'nome': nome,
                    'cognome': cognome,
                    'codice_telegram': telegram_id,
                    'data_inizio': data_inizio_ts,
                    'data_fine': data_fine_ts,
                    'garage': garage,
                    'gruppo': gruppo,
                    'commento': commento,
                    'nome_telegram': '', # Sarà popolato dal bot
                    'cognome_telegram': '' # Sarà popolato dal bot
                }

                # --- SCRITTURA SU FIREBASE ---
                try:
                    # Usiamo l'ID Telegram come ID del documento per evitare duplicati
                    doc_ref = db.collection(COLLECTION_UTENTI).document(telegram_id)
                    doc_ref.set(user_data) # set() sovrascrive se esiste già un utente con lo stesso ID
                    print(f"  OK: Utente {nome} {cognome} (ID: {telegram_id}) importato/aggiornato.")
                    utenti_importati += 1
                except Exception as e:
                    print(f"  ERRORE FIREBASE: Impossibile importare utente ID {telegram_id}: {e}")
                    utenti_saltati += 1
            
            except IndexError:
                # Questo catch serve se una riga ha meno colonne del previsto (gestito sopra, ma è un failsafe)
                print(f"\nERRORE riga {line_num}: La riga non ha abbastanza colonne. Saltata.")
                utenti_saltati += 1
            except Exception as e_row:
                # Altro errore inaspettato sulla riga
                print(f"\nERRORE INASPETTATO riga {line_num}: {e_row}. Saltata.")
                utenti_saltati += 1


except FileNotFoundError:
    print(f"ERRORE: File CSV '{CSV_FILE_PATH}' non trovato.")
    exit(1)
except Exception as e:
    print(f"ERRORE DURANTE LA LETTURA DEL CSV: {e}")
    exit(1)

print(f"\n--- Importazione completata ---")
print(f"Utenti importati/aggiornati: {utenti_importati}")
print(f"Righe saltate (errori o dati mancanti): {utenti_saltati}")