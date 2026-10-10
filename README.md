# NMS Alliance Manager

Dashboard Next.js per coordinare le missioni di un'alleanza: stato, responsabile, settore, priorità, scadenza e avanzamento. Include ricerca, filtri e gestione completa delle missioni.

## Lingue

L'interfaccia è disponibile in italiano e inglese. La prima visita usa la lingua preferita dal browser (inglese se la lingua del browser è inglese, italiano negli altri casi); la scelta può essere cambiata dal selettore nell'intestazione e viene salvata nel browser. La lingua selezionata non modifica gli URL.

I cataloghi sono separati per lingua in `src/lib/translations/`. Le chiavi canoniche sono stringhe inglesi; `en.ts` usa queste chiavi come testo sorgente, mentre `it.ts` organizza le traduzioni per area (`common`, `navigation`, `missions`, `stations`, `members`, `profile`, `admin`, `planet`, `auth`, `system`, `errors`). Per aggiungere una lingua, crea un catalogo in questa cartella usando le stesse chiavi inglesi, aggiungila al tipo `Locale` e registrala in `src/lib/translations.ts`. Le nuove voci senza traduzione usano automaticamente la chiave inglese. Le forme italiane attualmente usate come chiavi nei componenti vengono ricondotte alla traduzione partendo dal catalogo; `aliases` in `it.ts` contiene solo le varianti legacy aggiuntive.

## Avvio locale

```bash
npm install
npm run dev
```

Apri http://localhost:3000. Senza `NMS_READ_WRITE_TOKEN` (o `BLOB_READ_WRITE_TOKEN` come fallback), l'app salva i dati in `data/` nella cartella di progetto. I file dati sono esclusi da Git.

## Deploy su Vercel

1. Importa il repository in Vercel e crea un Blob Store privato dal pannello Storage del progetto.
2. Nella scheda **Projects** dello store scegli **Connect to Project** e abilita **Production**. Vercel configura `BLOB_STORE_ID`; l'app supporta anche `NMS_STORE_ID`. L'SDK recupera e aggiorna automaticamente il token OIDC fornito da Vercel: non copiarlo manualmente e non serve un read-write token. Blob e OIDC sono disponibili anche sul piano Hobby, entro i limiti del piano. Per ambienti senza OIDC puoi usare `NMS_READ_WRITE_TOKEN` (o `BLOB_READ_WRITE_TOKEN`).
3. Esegui il deploy, oppure un **Redeploy** se hai appena collegato lo store o modificato le variabili. Il servizio usa il file privato `alliance-manager/missions.json` nello store Blob; non usa il filesystem effimero della Function.

In produzione l'app rifiuta le operazioni di storage se non è configurata l'autenticazione OIDC o un read-write token. `NMS_WEBHOOK_PUBLIC_KEY` non autentica le operazioni Blob. Il file `.env.example` documenta le variabili; non inserire token in Git.

Se dopo l'accesso Google compare un errore 500 con un log che richiede la configurazione Blob, verifica il collegamento dello store al progetto e la presenza di `BLOB_STORE_ID` o `NMS_STORE_ID` nell'ambiente **Production**, poi esegui un redeploy. La registrazione del profilo richiede lo storage anche prima dell'approvazione dell'account.

## Accesso e ruoli

L'accesso usa Google OAuth tramite Auth.js. Crea credenziali OAuth in Google Cloud e imposta `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL` e `ALLIANCE_ADMIN_EMAIL` in `.env.local` per lo sviluppo e nelle variabili d'ambiente Vercel. In locale usa `AUTH_URL=http://localhost:3000/api/auth`, così il callback resta su localhost anche se il server è in ascolto su tutte le interfacce. Configura come redirect URI Google `http://localhost:3000/api/auth/callback/google` in locale e `https://<dominio-vercel>/api/auth/callback/google` in produzione. In produzione imposta `AUTH_URL=https://<dominio-vercel>/api/auth`. Imposta `ALLIANCE_ADMIN_EMAIL=youremail@gmail.com` per il primo admin.

Gli account Google verificati entrano come utenti normali; l'admin può promuovere utenti registrati a moderatore o admin. Gli utenti prendono missioni non assegnate, i moderatori creano/modificano/assegnano missioni e l'admin gestisce anche i ruoli e il branding dell'alleanza. Logo e banner sono serviti tramite endpoint autenticato dal Blob privato. Le API verificano sempre sessione e ruolo lato server.

Ogni nuovo account Google resta in attesa finché un moderatore o admin non lo approva. Gli account pendenti possono completare solo il proprio profilo; missioni, membri e branding restano inaccessibili fino all'approvazione. Moderatori e admin possono anche bloccare account o rimuoverli dalla lista alleanza; il blocco nega l'accesso, mentre la cancellazione rimuove il profilo e un successivo nuovo login richiede una nuova approvazione. I moderatori possono gestire utenti normali, l'admin anche moderatori; l'account admin configurato non può essere bloccato o eliminato. L'admin iniziale configurato in `ALLIANCE_ADMIN_EMAIL` viene approvato automaticamente.

Ogni membro completa il proprio profilo con nome in gioco, codice amico NMS alfanumerico di 13 caratteri, una o più piattaforme (PC, PlayStation, Xbox, Nintendo Switch, Mac) e una specializzazione (Costruttore, Ranger o Esploratore). Il ruolo non è modificabile dall'utente. Non si possono prendere o assegnare missioni a profili incompleti.

## Verifica

```bash
npm run lint
npm run build
```

I dati demo iniziali sono definiti in `src/lib/seed.ts`. Gli endpoint CRUD sono `/api/missions` e `/api/missions/[id]`.

## Indirizzi dei sistemi

Ogni missione richiede un indirizzo portale completo di 12 glifi esadecimali (`0`-`F`) e un indice galattico (`0`-`255`). L'interfaccia mostra i parametri decodificati `Planet / System / Y / Z / X` e segnala valori riservati/non validi. I PNG dei glifi sono in `public/glyphs/` e provengono da [NMS Galactic Map](https://github.com/elegra1965-source/nms-galactic-map/tree/main/glyphs). Sono immagini di No Man's Sky, proprietà dei rispettivi titolari e non coperte dalla licenza software del repository sorgente; questo progetto fan-made non è affiliato né approvato da Hello Games.

Gli indirizzi vengono verificati tramite l'API di [NMS Almanac](https://nmsalmanac.com/api/docs), usando la galassia selezionata. Un risultato positivo conferma che il pianeta è presente nell'Almanac e popola `Nome sistema / settore` con un'etichetta descrittiva composta da stella, economia, conflitto e razza; Almanac non fornisce il nome proprio del sistema. La risposta JSON completa viene conservata in `data/almanac.json`, indicizzata per codice portale e galassia, oppure nel Blob privato in produzione; le verifiche successive riutilizzano il dato salvato. Il flag `systemVerified` viene salvato sulla missione e azzerato se cambia indirizzo o galassia. Un `404` indica che il pianeta non è catalogato, ma non prova che non esista nel gioco e non impedisce il salvataggio. Il servizio consente fino a 500 richieste l'ora e può non essere disponibile; in tali casi il salvataggio resta possibile senza verifica.
