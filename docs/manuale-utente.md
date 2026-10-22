---
title: Manuale utente – Vista semplice
description: Guida per gli utenti che usano la vista semplice dell app
---

# Manuale utente – Vista semplice

## Legenda dei pulsanti

Le icone sono indicate con il nome della libreria Lucide, i colori sono quelli dei pulsanti nell'app. I pulsanti portano da una sezione all'altra o aprono un dettaglio.

| Pulsante | Icona |
|---|---|
| Vai alla [stazione](#stazioni) | `Orbit` |
| Vai alle [missioni](#missioni) collegate | `Crosshair` |
| Crea missione dalla stazione | `CirclePlus` |
| Vai al [pianeta](#dettaglio-pianeta) (dalle richieste d'aiuto) | `Eclipse` |
| Note della missione o della stazione | `FileText` |
| Note del pianeta | `Info` |
| Richiedi intervento Ranger | `Compass` |
| Richiedi intervento Esploratori | `Search` |
| Richiedi intervento Costruttori | `Hammer` |
| Richiedi [aiuto](#richieste-daiuto) per il pianeta | `Siren` |

Note e richieste d'aiuto **non** hanno lo stesso colore: le note sono arancioni, la richiesta d'aiuto è gialla.

Colori delle specializzazioni:

| Specializzazione | Icona |
|---|---|
| [Ranger](#ranger) | `Compass` |
| [Esploratore](#esploratore-e-costruttore) | `Search` |
| [Costruttore](#esploratore-e-costruttore) | `Hammer` |

<a id="1-concetti-generali"></a>

## 1. Concetti generali

**Vista semplice e ruoli.** In vista semplice tutti hanno gli stessi permessi, anche moderatori e admin, che vengono trattati come utenti normali. Quello che cambia è la **specializzazione** scelta nel profilo: Ranger, Costruttore o Esploratore. Per questo il manuale è organizzato per specializzazione, non per ruolo.

**Pagine non disponibili in vista semplice.** Utenti, Giocatori offline, Pianeti e Missioni (la gestione completa) sono nascosti, come le impostazioni dell'alleanza e l'export Excel. Moderatori e admin le vedono passando a "vista admin" con il toggle nell'header o con la casella "Vista semplice" nel profilo.

**Primo accesso.**
1. Accedi con Google.
2. L'account parte come **in attesa di approvazione**. Finché un moderatore o un admin non lo approva puoi solo completare il profilo ed uscire.
3. Se l'accesso viene bloccato, compare un messaggio con l'invito a contattare i moderatori.

**Profilo.** Si apre dall'header ed è modificabile solo dal proprietario. Contiene:
- nome in gioco;
- codice amico NMS, 13 caratteri alfanumerici (i trattini sono ignorati);
- nelle schede NMS, il codice amico è visibile a tutti i membri approvati, anche in vista semplice, nel formato `XXXX-XXXX-XXXXX`;
- una o più piattaforme: PC, SteamOS, PlayStation, Xbox, Nintendo Switch, Mac;
- specializzazione: Costruttore, Ranger o Esploratore;
- contatti Telegram e Discord, opzionali;
- l'opzione **Mostra le pulsazioni**, che puoi deselezionare per disattivare le animazioni di pulsazione nell'app.

Senza profilo completo non puoi prendere missioni né ricevere assegnazioni. Un banner ti avvisa.

**Navigazione.** Dalla sidebar vedi Classifica, Servizio taxi, Messaggi, Richieste d'aiuto e Missioni/Stazioni se visibili per la tua specializzazione. I contatori mostrano i messaggi e le richieste non letti. Sono presenti anche i link alla community (Discord/Telegram). Nell'header trovi lingua, profilo, vista (solo per moderatori/admin) ed esci.

## 2. Come funziona una missione

Una missione riguarda un pianeta/sistema, identificato da un indirizzo portale (12 glifi esadecimali) o da un codice di 8 glifi, più la galassia (0-255). Stati: **In attesa → In corso → Completata**.

Ogni specializzazione ha le sue voci di avanzamento da spuntare:
- **Ranger:** Stazione riscattata, Sistema rinominato.
- **Esploratore:** Mappato, Pianeti classificati, Dati caricati.
- **Costruttore:** Edifici costruiti, Basi caricate.

Le voci spuntate fanno salire la percentuale fino a un massimo dell'80%. Il 100% si raggiunge con "Completa missione", attivo solo quando le tue voci sono tutte spuntate.

Nelle pagine di dettaglio, il collegamento di ritorno riporta alla pagina da cui hai aperto la scheda, mantenendo l'eventuale ricerca nell'indirizzo. Nei passaggi tra schede trovi «Torna alla scheda missione» o «Torna alla scheda stazione»; per gli elenchi resta «Torna alle missioni» o «Torna alle stazioni». Aprendo un indirizzo direttamente, senza una pagina di provenienza, il ritorno porta alla sezione corrispondente.

## 3. Ruolo per ruolo

<a id="ranger"></a>

### Ranger (verde)
Scopre i sistemi e registra le **stazioni**.

**Stazioni**
- Vede tutte le stazioni dell'alleanza e può filtrare per "Tutte", "Mie stazioni", "In attesa", "In missione", "Le mie missioni" (solo se hai missioni assegnate su quella stazione) e "Missione completata", oltre a cercare per portale, proprietario, galassia o note.
- Registra una nuova stazione con "Aggiungi stazione": indirizzo portale, galassia, nome (max 80 caratteri) e note (max 1000). Può registrare solo per sé.
- Sulle **proprie** stazioni può:
  - spuntare le voci Ranger (Stazione riscattata, Sistema rinominato);
  - modificare nome e note;
  - eliminare la stazione, solo se non ha missioni collegate;
  - creare una missione per Esploratori/Costruttori (icona "+"), se non sono già coperti.
- Può aprire il dettaglio del pianeta e leggere le note.

**Missioni.** Vede quelle destinate a "Tutti" o ai Ranger. Può prendere o iniziare una missione assegnata a sé e spuntare le proprie voci.

<a id="esploratore-e-costruttore"></a>

### Esploratore (blu) e Costruttore (arancione)
Hanno lo stesso funzionamento, ciascuno con le proprie voci.

**Stazioni**
- Vedono tutte le stazioni ma non possono registrarne né modificarne di altrui.
- Possono creare una missione **per la propria specializzazione** da una stazione (icona "+"). Viene assegnata automaticamente a loro. Il sistema impedisce di crearla se quella specializzazione è già coperta, o se c'è già un altro pianeta dello stesso sistema.
- Se una missione esiste già, l'icona con il mirino apre il dettaglio della missione per la tua specializzazione: trovi prima tutte le missioni associate, poi la stazione e i pianeti del sistema, senza duplicare la missione in un blocco separato. Se è già in carico a un altro membro compare l'etichetta "missione associata".

**Missioni**
- Vedono le missioni per "Tutti", per la propria specializzazione, o "Esploratore + Costruttore" se sono Esploratori o Costruttori. Se una missione ha un assegnatario, la vede solo lui.
- Cliccano "Prendi" su una missione libera (diventa subito "In corso").
- Se la missione è assegnata ma "In attesa", cliccano "Inizia".
- Spuntano le proprie voci, poi cliccano "Completa". Una missione completata si può riaprire.
- Aprono dalla scheda le note del pianeta (se presenti) e il dettaglio.

## 4. Pagina per pagina

Missioni e Stazioni mostrano fino a 50 elementi per pagina; Pianeti mostra fino a 20 sistemi per pagina, senza dividere i pianeti di un sistema tra pagine diverse. Quando ci sono più pagine, usa **Pagina precedente** e **Pagina successiva**. Ricerca e filtri si applicano all'intero elenco e riportano alla prima pagina.

<a id="stazioni"></a>

### `Orbit` Stazioni
Descritta sopra per ogni specializzazione. Il nome della pagina è "Le mie stazioni" per i Ranger.

L'azione **Apri dettaglio stazione** sulla scheda apre una pagina dedicata con i blocchi **Stazione**, **Missioni associate**, **Sistema e pianeti**. Il blocco **Missioni associate** appare solo se ci sono missioni e le mostra direttamente, senza tab, ricerca o paginazione. Solo in questo dettaglio sono visibili tutte le missioni dello stesso sistema e della stessa galassia, anche di altre specializzazioni o assegnate ad altri. **Inizia** e **Completa** sono disponibili solo sulle missioni assegnate a te; **Prendi in carico** compare sulle missioni libere per la tua specializzazione o per tutti. Le missioni di altre specializzazioni o assegnate ad altri non mostrano azioni operative. Le azioni di gestione di moderatori e admin restano invariate. Nella pagina **Missioni** restano i consueti filtri di visibilità e la possibilità di prendere in carico le missioni compatibili. **Torna alle stazioni** riapre l'elenco principale.

Il collegamento usa proprietario, portale e galassia: se questi cambiano, cambia anche il link. Dopo una modifica vieni indirizzato al dettaglio aggiornato; dopo l'eliminazione torni all'elenco.
I collegamenti a una stazione specifica da Pianeti, Missioni, Messaggi e Servizio taxi aprono direttamente questo dettaglio, nella galassia corretta. Se la stazione non è più disponibile, nei messaggi e nelle richieste taxi non viene mostrato un link non valido. I collegamenti alle stazioni di un membro continuano invece ad aprire l'elenco filtrato.
Il link di ritorno indica la pagina di provenienza: **Torna ai pianeti**, **Torna alle missioni**, **Torna ai messaggi** o **Torna al servizio taxi**. Se apri il dettaglio direttamente o dall'elenco stazioni, trovi **Torna alle stazioni**. La provenienza resta nel collegamento anche dopo una modifica delle coordinate o del proprietario.

Nel blocco **Sistema e pianeti** del dettaglio non viene mostrato il collegamento alla stazione, perché sei già nella sua pagina.
Se il sistema ha richieste d'aiuto, il dettaglio mostra anche **Richieste d'aiuto** come ultimo blocco, dopo **Sistema e pianeti**. Sono incluse le richieste per qualsiasi pianeta dello stesso sistema e della stessa galassia, con le risposte e le consuete azioni consentite. Il blocco non appare se non ci sono richieste associate.
La scheda stazione nel dettaglio occupa tutta la larghezza del blocco.
Il link al dettaglio è blu e segue l'icona delle missioni associate, quando presente. Nella pagina di dettaglio il link non viene mostrato.
Nel dettaglio è nascosta anche l'azione **Apri missioni associate**, perché le missioni sono già elencate sotto la stazione. Il pulsante **+** per creare una missione resta disponibile quando consentito dal ruolo e dalla specializzazione.
L'azione di eliminazione, quando consentita, è sempre l'ultima, dopo modifica ed eventuali note.

<a id="missioni"></a>

### `Crosshair` Missioni
- Filtri per stato: Tutte, In corso, In attesa, Completate (assegnate o libere).
- Ogni scheda mostra pianeta e galassia, specializzazione richiesta, scopritore, assegnatario, priorità e avanzamento.
- Il titolo apre il **dettaglio pianeta**.
- Il nome di scopritore e assegnatario apre il profilo del membro, da cui si può scrivere un messaggio.
- Una missione completata non si modifica più. Chi l'ha completata può riaprirla.

<a id="dettaglio-pianeta"></a>

### `Eclipse` Dettaglio pianeta
Mostra i dati del pianeta e, tramite l'icona sirena, permette di inviare una **richiesta d'aiuto** (vedi [Richieste d'aiuto](#richieste-daiuto)).
Le etichette **Paradiso** e **Dissonante** compaiono quando indicate dai dati Almanac, senza sostituire le descrizioni delle condizioni del pianeta.

Nella pagina **Pianeti**, le card mostrano anche le icone di flora, fauna e minerali con i conteggi disponibili in Almanac. Gli stessi contatori compaiono nel dettaglio pianeta, prima del codice portale, e si aggiornano selezionando un altro pianeta. I valori mancanti non vengono mostrati; un conteggio pari a zero resta visibile.

### Dettaglio missione

L'icona **Apri dettaglio missione** nelle card apre una pagina dedicata; il titolo continua ad aprire il dettaglio del pianeta/sistema.
La pagina mostra prima la missione selezionata a tutta larghezza, poi gli stessi blocchi del dettaglio stazione: **Stazione**, **Missioni associate**, **Sistema e pianeti** ed eventuali **Richieste d'aiuto**.
La missione selezionata resta anche nell'elenco delle associate: azioni e avanzamento si aggiornano in entrambe le copie.
Valgono gli stessi permessi del dettaglio stazione: puoi prendere in carico missioni libere compatibili con la tua specializzazione e gestire le tue missioni; le altre restano consultabili.
Se la stazione collegata non è più disponibile, compare un avviso e la pagina resta accessibile secondo i normali permessi di visibilità delle missioni, senza rendere visibili missioni altrui normalmente nascoste.
Il link di ritorno indica la sezione di provenienza; eliminando la missione selezionata si torna a **Missioni**.

Le card stazione dello stesso sistema e della stessa galassia dell'hub configurato dall'amministratore mostrano il ribbon rosso **Hub alleanza** in alto a sinistra, al posto di **New**. Il confronto ignora il primo glifo del portale, che identifica il pianeta.

<a id="classifica"></a>

### `Trophy` Classifica
Mostra la posizione dei membri per punti: stazioni scoperte, missioni completate e voci spuntate, più i totali dell'alleanza (pianeti, membri, stazioni, missioni, task). È solo in lettura.

### `CarTaxiFront` Servizio taxi

Chiedi un passaggio o aiuta un alleato rispondendo alla sua richiesta.
Il contatore nel menu mostra il numero di richieste taxi in corso (senza contare risposte e richieste archiviate) e si aggiorna automaticamente.

- Premi **Richiedi un taxi**, scegli la **galassia di destinazione**, il **punto d'incontro** e scrivi un messaggio.
- Per creare una richiesta serve un codice amico NMS valido in **Il mio profilo NMS**. Se manca, il pulsante apre il profilo per completarlo. Puoi comunque leggere e rispondere.
- Il punto d'incontro parte da **Offline**. Puoi scegliere **Da concordare nelle risposte**, **Hub dell'alleanza** (se configurato) o una stazione. Clicca sul campo o sulla freccia per aprire l'elenco e scrivi per cercare.
- **Clicca sul nome del richiedente o di chi risponde** per aprire la scheda NMS e trovare il suo **codice amico**.
- Il link del punto d'incontro apre la pagina Stazioni. Per l'hub compare se esiste una stazione nello stesso sistema e nella stessa galassia.
- Tutti i membri approvati possono vedere le richieste e rispondere.
- Puoi eliminare le tue richieste e risposte; moderatori/admin possono eliminare anche quelle altrui. Eliminando una richiesta vengono eliminate tutte le sue risposte.
- Le richieste taxi restano separate dalle Richieste d'aiuto e dai messaggi privati.
- I tab **In corso** e **Archiviati** separano le richieste aperte da quelle concluse. L'autore della richiesta e i moderatori/admin possono premere **Archivia**, prima di Cancella: l'intera conversazione viene conservata, ma non accetta nuove risposte. Gli archiviati sono inizialmente chiusi: usa la freccia per espandere il messaggio e le risposte. In **Archiviati**, gli stessi utenti possono usare **Ripristina** per riportarla in corso e consentire di nuovo le risposte. In vista semplice valgono i permessi da utente.

<a id="messaggi"></a>

### `Mail` Messaggi
- Le pagine di dettaglio conversazione sono disponibili tramite indirizzo diretto (`/messages/ID`, `/help-requests/ID`, `/taxi/ID`), senza nuovi collegamenti negli elenchi per ora. Mostrano soltanto il messaggio iniziale, tutte le risposte aperte e il ritorno alla sezione, mantenendo le azioni consentite. L'indirizzo di una risposta apre la conversazione completa accessibile. Le richieste archiviate restano senza possibilità di rispondere fino al ripristino.
- I nomi di mittente e destinatario sono cliccabili e aprono la scheda NMS in sola consultazione. I nomi senza un membro associato restano testo normale.
- Si scrive dal profilo di un membro (cliccando il suo nome). Il messaggio deve riguardare un **pianeta** o una **missione**. Prima dell'invio bisogna confermare che serve solo per quello, perché per il resto si usa Telegram o Discord.
- Si può scrivere solo a membri approvati e non offline. Max 2000 caratteri.
- Vedi i messaggi ricevuti e inviati, raggruppati in conversazioni. Puoi rispondere e segnare come letto. Puoi eliminare un messaggio solo se sei mittente o destinatario.

<a id="richieste-daiuto"></a>

### `Siren` Richieste d'aiuto
- Clicca il nome dell'autore di una richiesta o risposta per consultarne la scheda NMS.
- Elenco delle richieste di tutti gli alleati, con eventuali risposte.
- Si invia dalla scheda di un pianeta: scrivi il messaggio (max 2000 caratteri), spunta la conferma e premi "Invia richiesta".
- Tutti possono rispondere alle richieste in corso.
- Si può eliminare solo la propria richiesta (con le risposte). Chi ha il ruolo moderatore/admin può eliminare quelle altrui.
- I tab **In corso** e **Archiviati** funzionano come nel Servizio taxi, anche nel dettaglio stazione: **Archivia** conserva richiesta e risposte senza consentirne altre; **Ripristina** riapre la conversazione. Entrambe le azioni sono disponibili all'autore della richiesta e ai moderatori/admin (in vista semplice valgono i permessi da utente). Il contatore nel menu include solo le richieste in corso.

<a id="profilo"></a>

### `UserRound` Profilo
Vedi la sezione [Concetti generali](#1-concetti-generali).

## 5. Cose che non si possono fare in vista semplice
- Approvare, bloccare o cambiare ruolo agli utenti.
- Creare, modificare o cancellare missioni qualsiasi, o assegnarle ad altri.
- Registrare stazioni per altri o modificare quelle altrui.
- Esportare le stazioni in Excel.
- Modificare le impostazioni dell'alleanza.
