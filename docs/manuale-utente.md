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
- una o più piattaforme: PC, SteamOS, PlayStation, Xbox, Nintendo Switch, Mac;
- specializzazione: Costruttore, Ranger o Esploratore;
- contatti Telegram e Discord, opzionali;
- l'opzione **Mostra le pulsazioni**, che puoi deselezionare per disattivare le animazioni di pulsazione nell'app.

Senza profilo completo non puoi prendere missioni né ricevere assegnazioni. Un banner ti avvisa.

**Navigazione.** Dalla sidebar vedi Classifica, Richieste d'aiuto, Messaggi e Missioni/Stazioni se visibili per la tua specializzazione. I contatori mostrano i messaggi e le richieste non letti. Sono presenti anche i link alla community (Discord/Telegram). Nell'header trovi lingua, profilo, vista (solo per moderatori/admin) ed esci.

## 2. Come funziona una missione

Una missione riguarda un pianeta/sistema, identificato da un indirizzo portale (12 glifi esadecimali) o da un codice di 8 glifi, più la galassia (0-255). Stati: **In attesa → In corso → Completata**.

Ogni specializzazione ha le sue voci di avanzamento da spuntare:
- **Ranger:** Stazione riscattata, Sistema rinominato.
- **Esploratore:** Mappato, Pianeti classificati, Dati caricati.
- **Costruttore:** Edifici costruiti, Basi caricate.

Le voci spuntate fanno salire la percentuale fino a un massimo dell'80%. Il 100% si raggiunge con "Completa missione", attivo solo quando le tue voci sono tutte spuntate.

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
- Se una missione esiste già, un'icona apre le missioni collegate. Se è già in carico a un altro membro compare l'etichetta "missione associata".

**Missioni**
- Vedono le missioni per "Tutti", per la propria specializzazione, o "Esploratore + Costruttore" se sono Esploratori o Costruttori. Se una missione ha un assegnatario, la vede solo lui.
- Cliccano "Prendi" su una missione libera (diventa subito "In corso").
- Se la missione è assegnata ma "In attesa", cliccano "Inizia".
- Spuntano le proprie voci, poi cliccano "Completa". Una missione completata si può riaprire.
- Aprono dalla scheda le note del pianeta (se presenti) e il dettaglio.

## 4. Pagina per pagina

<a id="stazioni"></a>

### `Orbit` Stazioni
Descritta sopra per ogni specializzazione. Il nome della pagina è "Le mie stazioni" per i Ranger.

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

<a id="classifica"></a>

### `Trophy` Classifica
Mostra la posizione dei membri per punti: stazioni scoperte, missioni completate e voci spuntate, più i totali dell'alleanza (pianeti, membri, stazioni, missioni, task). È solo in lettura.

<a id="richieste-daiuto"></a>

### `Siren` Richieste d'aiuto
- Elenco delle richieste di tutti gli alleati, con eventuali risposte.
- Si invia dalla scheda di un pianeta: scrivi il messaggio (max 2000 caratteri), spunta la conferma e premi "Invia richiesta".
- Tutti possono rispondere.
- Si può eliminare solo la propria richiesta (con le risposte). Chi ha il ruolo moderatore/admin può eliminare quelle altrui.

<a id="messaggi"></a>

### `Mail` Messaggi
- Si scrive dal profilo di un membro (cliccando il suo nome). Il messaggio deve riguardare un **pianeta** o una **missione**. Prima dell'invio bisogna confermare che serve solo per quello, perché per il resto si usa Telegram o Discord.
- Si può scrivere solo a membri approvati e non offline. Max 2000 caratteri.
- Vedi i messaggi ricevuti e inviati, raggruppati in conversazioni. Puoi rispondere e segnare come letto. Puoi eliminare un messaggio solo se sei mittente o destinatario.

<a id="profilo"></a>

### `UserRound` Profilo
Vedi la sezione [Concetti generali](#1-concetti-generali).

## 5. Cose che non si possono fare in vista semplice
- Approvare, bloccare o cambiare ruolo agli utenti.
- Creare, modificare o cancellare missioni qualsiasi, o assegnarle ad altri.
- Registrare stazioni per altri o modificare quelle altrui.
- Esportare le stazioni in Excel.
- Modificare le impostazioni dell'alleanza.
