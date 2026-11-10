import Link from "next/link";
import {
  ArchiveIcon,
  BuilderIcon,
  CloseIcon,
  CreateMissionIcon,
  DeleteIcon,
  EditIcon,
  ExplorerIcon,
  FarmIcon,
  GuideIcon,
  HelpRequestIcon,
  InfoIcon,
  JoinIcon,
  LeaderboardIcon,
  MapIcon,
  MarkReadIcon,
  MessagesIcon,
  MissionIcon,
  NotesIcon,
  PetIcon,
  PlanetIcon,
  ProfileIcon,
  RangerIcon,
  ReopenIcon,
  ReplyIcon,
  RestoreIcon,
  SignOutIcon,
  StationIcon,
  TaxiIcon,
  type IconComponent,
} from "@/components/shared/icons";
import { Hero } from "@/components/layout/hero";
import { AddStationButtonExample } from "@/components/guide/add-station-button-example";
import { MessageComposerExamples } from "@/components/guide/message-composer-examples";
import { TaxiExamples } from "@/components/guide/taxi-examples";
import { FarmExamples } from "@/components/guide/farm-examples";
import { PetExamples } from "@/components/guide/pet-examples";
import { MessageTabsExample } from "@/components/guide/message-tabs-example";
import { translate } from "@/lib/translations";
import { readAccessData } from "@/lib/members/access-store";
import {
  BuilderOwnStationExample,
  ExplorerAvailableStationExample,
  ExplorerBuilderStationExamples,
  ExplorerOwnStationExample,
  RangerOwnStationExample,
  RangerStationExamples,
} from "@/components/guide/station-examples";
import {
  BuilderAvailableMissionExample,
  BuilderMissionProgressExamples,
  BuilderMissionExamples,
  ExplorerAvailableMissionExample,
  ExplorerMissionProgressExamples,
  ExplorerMissionExamples,
  RangerMissionExamples,
} from "@/components/guide/mission-examples";
import { MissionTabsExample } from "@/components/guide/mission-tabs-example";
import { StationTabsExample } from "@/components/guide/station-tabs-example";
import { AddressValidationExample } from "@/components/guide/address-validation-example";
import { StationFormExample } from "@/components/guide/station-form-example";
import { guideStationInit } from "@/components/guide/station-init";
import { PlanetFiltersExample } from "@/components/guide/planet-filters-example";
import { createPlanetListExamplePlanet, PlanetListExample } from "@/components/guide/planet-list-example";
import { PlanetStationHeadingExample } from "@/components/guide/planet-station-heading-example";
import { emptyPlanetFilterValues } from "@/components/forms/planet-filters";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { AllianceSettings } from "@/lib/members/access-store";
import { sectionAccents } from "@/lib/navigation/section-accents";

const specialtyIcons = {
  ranger: { icon: RangerIcon, color: "#5fd68a", name: "Ranger" },
  explorer: { icon: ExplorerIcon, color: "#4d9bff", name: "Esploratore" },
  builder: { icon: BuilderIcon, color: "#ffb45d", name: "Costruttore" },
} as const;

const commonButtons: { label: string; icon: IconComponent; color: string; meaning: string }[] = [
  {
    label: "Modifica",
    icon: EditIcon,
    color: "#d0d4d0",
    meaning: "Modifica la missione o la stazione. Compare solo se l'hai creata tu o se ti è assegnata.",
  },
  {
    label: "Elimina",
    icon: DeleteIcon,
    color: "#ef8067",
    meaning: "Elimina la missione, la stazione o il messaggio. Ti viene chiesta una conferma.",
  },
  {
    label: "Archivia",
    icon: ArchiveIcon,
    color: "#d0d4d0",
    meaning:
      "Sposta una richiesta d'aiuto o di taxi e tutte le sue risposte in Archiviati. Non si può più rispondere finché non viene ripristinata. Disponibile per l'autore, i moderatori e gli amministratori.",
  },
  {
    label: "Togli dall'archivio",
    icon: RestoreIcon,
    color: "#d0d4d0",
    meaning:
      "Riporta una richiesta archiviata in In corso e permette di rispondere nuovamente. Disponibile per l'autore, i moderatori e gli amministratori.",
  },
  {
    label: "Riapri missione",
    icon: ReopenIcon,
    color: "#ef8067",
    meaning: "Riporta in corso una missione che avevi completato.",
  },
  { label: "Segna come letto", icon: MarkReadIcon, color: "#d0d4d0", meaning: "Segna un messaggio come letto." },
  { label: "Rispondi", icon: ReplyIcon, color: "#d0d4d0", meaning: "Apre il campo per rispondere a un messaggio." },
  {
    label: "Chiudi / Annulla",
    icon: CloseIcon,
    color: "#d0d4d0",
    meaning: "Chiude una finestra o annulla l'azione in corso.",
  },
  { label: "Il mio profilo", icon: ProfileIcon, color: "#d0d4d0", meaning: "Nell'header: apre il tuo profilo." },
  { label: "Esci", icon: SignOutIcon, color: "#d0d4d0", meaning: "Nell'header: disconnette dall'account." },
];

const buttons: ReadonlyArray<{
  label: string;
  specialty: ReadonlyArray<"ranger" | "explorer" | "builder">;
  icon: IconComponent;
  color: string;
  meaning: string;
  crossed?: boolean;
}> = [
  {
    label: "Vai alla stazione",
    specialty: ["ranger", "explorer", "builder"],
    icon: StationIcon,
    color: sectionAccents.stations,
    meaning: "Porta alla scheda stazione collegata.",
  },
  {
    label: "Vai alle missioni collegate",
    specialty: ["ranger", "explorer", "builder"],
    icon: MissionIcon,
    color: sectionAccents.missions,
    meaning:
      "Apre il dettaglio della missione per la tua specializzazione, mostrando prima tutte le missioni associate alla stazione.",
  },
  {
    label: "Mostra sulla mappa",
    specialty: ["ranger", "explorer", "builder"],
    icon: MapIcon,
    color: sectionAccents.map,
    meaning: "Apre la mappa sulla galassia della stazione, con il suo marker giallo e pulsante.",
  },
  {
    label: "Vai alla farm",
    specialty: ["ranger", "explorer", "builder"],
    icon: FarmIcon,
    color: sectionAccents.farms,
    meaning: "Sulle card dei pianeti: apre il dettaglio della farm registrata su quel pianeta.",
  },
  {
    label: "Vai al pet",
    specialty: ["ranger", "explorer", "builder"],
    icon: PetIcon,
    color: sectionAccents.pets,
    meaning: "Sulle card dei pianeti: apre il dettaglio del pet trovato su quel pianeta.",
  },
  {
    label: "Crea missione dalla stazione",
    specialty: ["ranger"],
    icon: CreateMissionIcon,
    color: sectionAccents.missions,
    meaning:
      "Crea una missione per il sistema di una propria stazione, per Esploratori e/o Costruttori non preassegnata",
  },
  {
    label: "Crea missione dalla stazione",
    specialty: ["builder", "explorer"],
    icon: CreateMissionIcon,
    color: sectionAccents.missions,
    meaning: "Crea una missione per il sistema per la propria specializzazione, assegnata a se stessi.",
  },
  {
    label: "Missione già in corso per la tua categoria",
    specialty: ["ranger"],
    icon: CreateMissionIcon,
    color: "#4f6f6a",
    crossed: true,
    meaning:
      "Al posto di «Crea missione dalla stazione» se esistono gia' missioni per Esploratori e Costruttori su quel sistema.",
  },
  {
    label: "Missione già in corso per la tua categoria",
    specialty: ["explorer", "builder"],
    icon: CreateMissionIcon,
    color: "#4f6f6a",
    crossed: true,
    meaning:
      "Al posto di «Crea missione dalla stazione» se esiste già una missione per la tua specializzazione su quel sistema.",
  },
  {
    label: "Vai al pianeta",
    specialty: ["ranger", "explorer", "builder"],
    icon: PlanetIcon,
    color: sectionAccents.planets,
    meaning: "Porta al pianeta collegato.",
  },
  {
    label: "Note di missione o stazione",
    specialty: ["ranger", "explorer", "builder"],
    icon: NotesIcon,
    color: "#e4b478",
    meaning: "Mostra le note scritte su una missione o una stazione.",
  },
  {
    label: "Note del pianeta",
    specialty: ["ranger", "explorer", "builder"],
    icon: InfoIcon,
    color: "#ff8400",
    meaning: "Mostra le note condivise sul pianeta.",
  },
  {
    label: "Richiedi intervento Ranger",
    specialty: ["builder", "explorer"],
    icon: RangerIcon,
    color: "#5fd68a",
    meaning: "Sulla missione completata, crea una missione per i Ranger non assegnata.",
  },
  {
    label: "Richiedi intervento Esploratori",
    specialty: ["builder", "ranger"],
    icon: ExplorerIcon,
    color: "#4d9bff",
    meaning: "Sulla missione completata, crea una missione per gli Esploratori non assegnata.",
  },
  {
    label: "Richiedi intervento Costruttori",
    specialty: ["ranger", "explorer"],
    icon: BuilderIcon,
    color: "#ffb45d",
    meaning: "Sulla missione completata, crea una missione per i Costruttori non assegnata.",
  },
  {
    label: "Richiedi aiuto",
    specialty: ["ranger", "explorer", "builder"],
    icon: HelpRequestIcon,
    color: "#ff4d4f",
    meaning: "Invia una richiesta d'aiuto per il pianeta.",
  },
];

const specialties = [
  {
    name: "Ranger",
    icon: RangerIcon,
    color: "#5fd68a",
    tasks: "Stazione aggiunta, Stazione riscattata, Sistema scansionato, Sistema rinominato, Dati sistema caricati",
  },
  {
    name: "Esploratore",
    icon: ExplorerIcon,
    color: "#4d9bff",
    tasks: "Stazione aggiunta, Sistema scansionato, Sistema esplorato, Dati caricati",
  },
  {
    name: "Costruttore",
    icon: BuilderIcon,
    color: "#ffb45d",
    tasks: "Stazione aggiunta, Edifici costruiti, Basi caricate",
  },
];

const sections = [
  {
    name: "Stazioni",
    icon: StationIcon,
    color: sectionAccents.stations,
    tasks: "Consulti o aggiungi stazioni spaziali, crei le missioni per quel sistema",
  },
  {
    name: "Missioni",
    icon: MissionIcon,
    color: sectionAccents.missions,
    tasks:
      "Consulti le missioni disponibili per te, prendi in carico quelle libere o inizi quelle assegnate, spunta le tue voci e completa la missione",
  },
  {
    name: "Pianeti",
    icon: PlanetIcon,
    color: sectionAccents.planets,
    tasks: "Consulti e filtri per proprietà i pianeti dell'archivio e trovi la stazione associata",
  },
  {
    name: "Mappa",
    icon: MapIcon,
    color: sectionAccents.map,
    tasks:
      "Vedi le stazioni dell'alleanza sulla mappa della loro galassia (hub in rosso, quelle con missioni per te in verde, le tue in arancione) e arrivi qui dalle schede stazione e dai sistemi di Pianeti",
  },
  {
    name: "Farm",
    icon: FarmIcon,
    color: sectionAccents.farms,
    tasks:
      "Registri i pianeti dove coltivi o raccogli risorse, filtri le farm dell'alleanza per piante e materiali e trovi la stazione del sistema",
  },
  {
    name: "Pet",
    icon: PetIcon,
    color: sectionAccents.pets,
    tasks:
      "Condividi dove hai trovato i tuoi pet, filtri quelli dell'alleanza per tipo, classi e altro, e scrivi allo scopritore per lo scambio uova",
  },
  {
    name: "Classifica",
    icon: LeaderboardIcon,
    color: "#e040c8",
    tasks: "Vedi la posizione dei membri e i totali dell'alleanza.",
  },
  {
    name: "Servizio taxi",
    icon: TaxiIcon,
    color: "#f5c518",
    tasks: "Richiedi un passaggio verso una galassia e concorda il punto d'incontro con gli alleati.",
  },
  {
    name: "Messaggi",
    icon: MessagesIcon,
    color: "#8f9bff",
    tasks:
      "Leggi e rispondi ai messaggi privati, segnali come letti o li elimini. Si scrivono dal profilo di un membro, su una stazione o una missione",
  },
  {
    name: "Richieste d'aiuto",
    icon: HelpRequestIcon,
    color: "#ff4d4f",
    tasks: "Consulti le richieste di tutti e rispondi. Le richieste si inviano dalla scheda di un pianeta",
  },
  {
    name: "Guida",
    icon: GuideIcon,
    color: "var(--lime)",
    tasks: "Consulta questa guida per istruzioni ed esempi sull'uso dell'alleanza.",
  },
];

export async function GuideContent({
  alliance,
  standalone = true,
}: Readonly<{ alliance?: AllianceSettings; standalone?: boolean }> = {}) {
  const guideAlliance = alliance ?? (await readAccessData()).alliance;
  const sample = guideStationInit;
  const planetExample = await createPlanetListExamplePlanet();

  return (
    <div className={standalone ? "guide-root" : "guide-root guide-root-in-app"}>
      {standalone && (
        <Hero settings={guideAlliance} subtitle="Cosa puoi fare, pagina per pagina" title="Guida">
          <Link className="banner-add" data-tooltip="Unisciti a noi" href="/">
            <JoinIcon size={17} /> <span className="banner-add-label">Unisciti a noi</span>
          </Link>
        </Hero>
      )}
      <nav aria-label="Indice della guida" className="guide-index">
        <strong>Indice</strong>
        <ul>
          <li>
            <a className="guide-index-profile" href="#primo-accesso">
              <ProfileIcon aria-hidden="true" size={15} />
              Primo accesso e profilo
            </a>
          </li>
          <li>
            <a className="guide-index-specialty-ranger" href="#guida-rapida-ranger">
              <RangerIcon aria-hidden="true" size={15} />
              Ranger
            </a>
          </li>
          <li>
            <a className="guide-index-specialty-explorer" href="#guida-rapida-esploratore">
              <ExplorerIcon aria-hidden="true" size={15} />
              Esploratore
            </a>
          </li>
          <li>
            <a className="guide-index-specialty-builder" href="#guida-rapida-costruttore">
              <BuilderIcon aria-hidden="true" size={15} />
              Costruttore
            </a>
          </li>
          <li>
            <a className="guide-index-basics" href="#nozioni-di-base">
              <InfoIcon aria-hidden="true" size={15} />
              Nozioni di base
            </a>
            <ul>
              <li>
                <a href="#sezioni">Sezioni</a>
              </li>
              <li>
                <a href="#specializzazioni">Specializzazioni</a>
              </li>
              <li>
                <a href="#legenda">Legenda dei pulsanti</a>
              </li>
              <li>
                <a href="#pulsanti-comuni">Pulsanti generali</a>
              </li>
            </ul>
          </li>
          <li>
            <a className="guide-index-stations" href="#stazioni">
              <StationIcon aria-hidden="true" size={15} />
              Stazioni
            </a>
            <ul>
              <li>
                <a href="#stazioni-funzionamento">Come funziona una stazione</a>
              </li>
              <li>
                <a href="#stazioni-creazione">Creare una stazione</a>
                <ul>
                  <li>
                    <a href="#stazioni-controlli-indirizzo-portale">Controlli sull&apos;indirizzo portale</a>
                  </li>
                </ul>
              </li>
              <li>
                <a href="#stazioni-lista">La lista delle stazioni</a>
                <ul>
                  <li>
                    <a href="#stazioni-lista-tab">Tab</a>
                  </li>
                  <li>
                    <a href="#stazioni-lista-ranger">Ranger</a>
                  </li>
                  <li>
                    <a href="#stazioni-lista-esploratori-costruttori">Esploratori e Costruttori</a>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li>
            <a className="guide-index-missions" href="#missioni">
              <MissionIcon aria-hidden="true" size={15} />
              Missioni
            </a>
            <ul>
              <li>
                <a href="#missioni-funzionamento">Come funziona una missione</a>
              </li>
              <li>
                <a href="#missioni-lista">La lista delle missioni</a>
                <ul>
                  <li>
                    <a href="#missioni-lista-tab">Tab</a>
                  </li>
                  <li>
                    <a href="#missioni-lista-esploratori">Esploratori</a>
                  </li>
                  <li>
                    <a href="#missioni-lista-costruttori">Costruttori</a>
                  </li>
                  <li>
                    <a href="#missioni-lista-ranger">Ranger</a>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li>
            <a className="guide-index-planets" href="#pianeti">
              <PlanetIcon aria-hidden="true" size={15} />
              Pianeti
            </a>
            <ul>
              <li>
                <a href="#pianeti-funzionamento">Come funziona un pianeta</a>
              </li>
              <li>
                <a href="#pianeti-lista">La lista dei pianeti</a>
                <ul>
                  <li>
                    <a href="#pianeti-ricerca-filtri">Ricerca e filtri</a>
                  </li>
                  <li>
                    <a href="#pianeti-sistema">Il sistema</a>
                  </li>
                  <li>
                    <a href="#pianeti-lista-pianeti">I pianeti</a>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li>
            <a className="guide-index-map" href="#mappa">
              <MapIcon aria-hidden="true" size={15} />
              Mappa
            </a>
          </li>
          <li>
            <a className="guide-index-farms" href="#farm">
              <FarmIcon aria-hidden="true" size={15} />
              Farm
            </a>
          </li>
          <li>
            <a className="guide-index-pets" href="#pet">
              <PetIcon aria-hidden="true" size={15} />
              Pet
            </a>
          </li>
          <li>
            <a className="guide-index-leaderboard" href="#classifica">
              <LeaderboardIcon aria-hidden="true" size={15} />
              Classifica
            </a>
          </li>
          <li>
            <a className="guide-index-help" href="#servizio-taxi">
              <TaxiIcon aria-hidden="true" size={15} />
              Servizio taxi
            </a>
          </li>
          <li>
            <a className="guide-index-messages" href="#messaggi">
              <MessagesIcon aria-hidden="true" size={15} />
              Messaggi
            </a>
          </li>
          <li>
            <a className="guide-index-help" href="#richieste-aiuto">
              <HelpRequestIcon aria-hidden="true" size={15} />
              Richieste d&apos;aiuto
            </a>
          </li>
        </ul>
      </nav>
      <LocaleProvider fixedLocale="it">
        <main className={standalone ? "guide-page" : "content-wrap guide-page"}>
          <section>
            <section id="primo-accesso">
              <h2 style={{ color: "var(--lime)" }}>
                <ProfileIcon aria-hidden="true" size={20} />
                Primo accesso e profilo
              </h2>
              <ul>
                <li>
                  Accedi con Google. L&apos;account resta <strong>in attesa</strong> finché un moderatore o un admin non
                  lo approva; nel frattempo puoi solo completare il profilo. Se l&apos;alleanza ha attivato
                  l&apos;avviso, quando vieni approvato ricevi anche un&apos;email all&apos;indirizzo Google con cui hai
                  fatto l&apos;accesso.
                </li>
                <li>
                  Profilo: nome in gioco, codice amico NMS (13 caratteri alfanumerici, i trattini sono ignorati), una o
                  più piattaforme, specializzazione, contatti Telegram/Discord opzionali.
                </li>
                <li>Senza profilo completo non puoi prendere missioni né ricevere assegnazioni.</li>
              </ul>
            </section>
            <h2 id="guida-rapida-ranger" style={{ color: "#5fd68a" }}>
              <RangerIcon aria-hidden="true" size={20} />
              Ranger
            </h2>
            <p>
              Registra le stazioni dei sistemi scoperti e aggiorna le relative attività Ranger. Se serve, crea dalla
              stazione una missione per Esploratori o Costruttori.
            </p>
            <p className="guide-station-instructions">
              Per registrare il sistema, vai in{" "}
              <span className="guide-destination guide-destination-stations">
                <StationIcon aria-hidden="true" size={14} />
                Stazioni
              </span>
              , premi questo pulsante, inserisci galassia e codice portale, quindi invia il modulo:
            </p>
            <AddStationButtonExample />
            <p>Dopo l&apos;invio, comparirà la scheda della tua stazione, come nell&apos;esempio qui sotto.</p>
            <RangerOwnStationExample allianceName={guideAlliance.name} sample={sample} />
            <p>
              Spunta i task che hai già completato e, se vuoi, crea missioni per Esploratori o Costruttori in quel
              sistema cliccando su{" "}
              <span
                aria-label="Crea una missione"
                className="guide-icon guide-quick-mission-icon"
                style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                title="Crea una missione"
              >
                <CreateMissionIcon aria-hidden="true" size={16} />
              </span>
            </p>
            <h2 id="guida-rapida-esploratore" style={{ color: "#4d9bff" }}>
              <ExplorerIcon aria-hidden="true" size={20} />
              Esploratore
            </h2>
            <p>L&apos;Esploratore ha più modi per crearsi una missione.</p>
            <ol className="guide-numbered-list">
              <li>
                Primo metodo: vai in{" "}
                <span className="guide-destination guide-destination-missions">
                  <MissionIcon aria-hidden="true" size={14} />
                  Missioni
                </span>{" "}
                e prendi in carico una missione disponibile.
                <ExplorerAvailableMissionExample allianceName={guideAlliance.name} sample={sample} />
              </li>
              <li>
                Secondo metodo: vai in{" "}
                <span className="guide-destination guide-destination-stations">
                  <StationIcon aria-hidden="true" size={14} />
                  Stazioni
                </span>
                , seleziona il tab <strong className="guide-tab-name">«In attesa»</strong> e clicca sull&apos;icona{" "}
                <span
                  aria-label="Crea una missione"
                  className="guide-icon guide-quick-mission-icon"
                  style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                  title="Crea una missione"
                >
                  <CreateMissionIcon aria-hidden="true" size={16} />
                </span>
                <ExplorerAvailableStationExample allianceName={guideAlliance.name} sample={sample} />
              </li>
              <li>
                <p className="guide-station-instructions">
                  Terzo metodo: vai in{" "}
                  <span className="guide-destination guide-destination-stations">
                    <StationIcon aria-hidden="true" size={14} />
                    Stazioni
                  </span>
                  , premi questo pulsante, inserisci galassia e codice portale, quindi invia il modulo:
                </p>
                <AddStationButtonExample />
                <p>Dopo l&apos;invio, comparirà la scheda della tua stazione, come nell&apos;esempio qui sotto.</p>
                <ExplorerOwnStationExample allianceName={guideAlliance.name} sample={sample} />
                <p>
                  Spunta i task che hai già completato e creati una missione cliccando su{" "}
                  <span
                    aria-label="Crea una missione"
                    className="guide-icon guide-quick-mission-icon"
                    style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                    title="Crea una missione"
                  >
                    <CreateMissionIcon aria-hidden="true" size={16} />
                  </span>
                </p>
              </li>
              <li className="guide-numbered-list-spaced">
                Quarto metodo: vai su{" "}
                <span className="guide-destination guide-destination-planets">
                  <PlanetIcon aria-hidden="true" size={14} />
                  Pianeti
                </span>
                , filtra in base alle caratteristiche che ti interessano e clicca sul link{" "}
                <span
                  aria-label="Apri la stazione associata"
                  className="guide-icon guide-quick-mission-icon"
                  style={{ color: sectionAccents.stations, borderColor: sectionAccents.stations }}
                  title="Apri la stazione associata"
                >
                  <StationIcon aria-hidden="true" size={16} />
                </span>
                <p>
                  Se il link pulsa, per quel sistema c&apos;è una missione disponibile per la tua specializzazione.
                  Cliccalo per aprire la scheda della stazione. Cliccando sull&apos;icona{" "}
                  <span
                    aria-label="Crea una missione"
                    className="guide-icon guide-quick-mission-icon guide-quick-mission-icon-spaced-right"
                    style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                    title="Crea una missione"
                  >
                    <CreateMissionIcon aria-hidden="true" size={16} />
                  </span>{" "}
                  puoi crearti una missione.
                </p>
              </li>
            </ol>
            <p>
              Quando crei la missione dall&apos;icona «+», si apre subito il suo dettaglio, con la notifica «Missione
              creata».
            </p>
            <p>
              Dopo esserti creato la missione, la troverai nella pagina{" "}
              <span className="guide-destination guide-destination-missions">
                <MissionIcon aria-hidden="true" size={14} />
                Missioni
              </span>
            </p>
            <ExplorerMissionProgressExamples allianceName={guideAlliance.name} sample={sample} />
            <h2 id="guida-rapida-costruttore" style={{ color: "#ffb45d" }}>
              <BuilderIcon aria-hidden="true" size={20} />
              Costruttore
            </h2>
            <p>Il Costruttore ha più modi per crearsi una missione.</p>
            <ol className="guide-numbered-list">
              <li>
                Primo metodo: vai in{" "}
                <span className="guide-destination guide-destination-missions">
                  <MissionIcon aria-hidden="true" size={14} />
                  Missioni
                </span>{" "}
                e prendi in carico una missione disponibile.
                <BuilderAvailableMissionExample allianceName={guideAlliance.name} sample={sample} />
              </li>
              <li>
                Secondo metodo: vai in{" "}
                <span className="guide-destination guide-destination-stations">
                  <StationIcon aria-hidden="true" size={14} />
                  Stazioni
                </span>
                , seleziona il tab <strong className="guide-tab-name">«In attesa»</strong> e clicca sull&apos;icona{" "}
                <span
                  aria-label="Crea una missione"
                  className="guide-icon guide-quick-mission-icon"
                  style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                  title="Crea una missione"
                >
                  <CreateMissionIcon aria-hidden="true" size={16} />
                </span>
                <ExplorerAvailableStationExample allianceName={guideAlliance.name} sample={sample} />
              </li>
              <li>
                <p className="guide-station-instructions">
                  Terzo metodo: vai in{" "}
                  <span className="guide-destination guide-destination-stations">
                    <StationIcon aria-hidden="true" size={14} />
                    Stazioni
                  </span>
                  , premi questo pulsante, inserisci galassia e codice portale, quindi invia il modulo:
                </p>
                <AddStationButtonExample />
                <p>Dopo l&apos;invio, comparirà la scheda della tua stazione, come nell&apos;esempio qui sotto.</p>
                <BuilderOwnStationExample allianceName={guideAlliance.name} sample={sample} />
                <p>
                  Spunta i task che hai già completato e creati una missione cliccando su{" "}
                  <span
                    aria-label="Crea una missione"
                    className="guide-icon guide-quick-mission-icon"
                    style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                    title="Crea una missione"
                  >
                    <CreateMissionIcon aria-hidden="true" size={16} />
                  </span>
                </p>
              </li>
              <li className="guide-numbered-list-spaced">
                Quarto metodo: vai su{" "}
                <span className="guide-destination guide-destination-planets">
                  <PlanetIcon aria-hidden="true" size={14} />
                  Pianeti
                </span>
                , filtra in base alle caratteristiche che ti interessano e clicca sul link{" "}
                <span
                  aria-label="Apri la stazione associata"
                  className="guide-icon guide-quick-mission-icon"
                  style={{ color: sectionAccents.stations, borderColor: sectionAccents.stations }}
                  title="Apri la stazione associata"
                >
                  <StationIcon aria-hidden="true" size={16} />
                </span>
                <p>
                  Se il link pulsa, per quel sistema c&apos;è una missione disponibile per la tua specializzazione.
                  Cliccalo per aprire la scheda della stazione. Cliccando sull&apos;icona{" "}
                  <span
                    aria-label="Crea una missione"
                    className="guide-icon guide-quick-mission-icon guide-quick-mission-icon-spaced-right"
                    style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                    title="Crea una missione"
                  >
                    <CreateMissionIcon aria-hidden="true" size={16} />
                  </span>{" "}
                  puoi crearti una missione.
                </p>
              </li>
            </ol>
            <p>Quando crei la missione dall&apos;icona «+», si apre subito il suo dettaglio.</p>
            <p>
              Dopo esserti creato la missione, la troverai nella pagina{" "}
              <span className="guide-destination guide-destination-missions">
                <MissionIcon aria-hidden="true" size={14} />
                Missioni
              </span>
            </p>
            <BuilderMissionProgressExamples allianceName={guideAlliance.name} sample={sample} />
          </section>

          <section id="nozioni-di-base">
            <h2>
              <InfoIcon aria-hidden="true" size={20} />
              Nozioni di base
            </h2>

            <section id="sezioni">
              <h3>Sezioni</h3>
              <div className="guide-table-wrap">
                <table className="guide-table">
                  <thead>
                    <tr>
                      <th>Sezioni</th>
                      <th>Icona</th>
                      <th>A cosa serve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((section) => (
                      <tr key={section.name}>
                        <td>
                          <strong style={{ color: section.color }}>{section.name}</strong>
                        </td>
                        <td>
                          <span className="guide-icon" style={{ color: section.color, borderColor: section.color }}>
                            <section.icon size={16} />
                          </span>
                        </td>
                        <td>{section.tasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="specializzazioni">
              <h3>Specializzazioni</h3>
              <div className="guide-table-wrap">
                <table className="guide-table">
                  <thead>
                    <tr>
                      <th>Specializzazione</th>
                      <th>Icona</th>
                      <th>Compiti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialties.map((specialty) => (
                      <tr key={specialty.name}>
                        <td>
                          <strong style={{ color: specialty.color }}>{specialty.name}</strong>
                        </td>
                        <td>
                          <span className="guide-icon" style={{ color: specialty.color, borderColor: specialty.color }}>
                            <specialty.icon size={16} />
                          </span>
                        </td>
                        <td>{specialty.tasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="legenda">
              <h3>Legenda dei pulsanti</h3>
              <p>Le icone sono quelle dei pulsanti che portano da una sezione all&apos;altra o aprono un dettaglio.</p>
              <div className="guide-table-wrap">
                <table className="guide-table">
                  <thead>
                    <tr>
                      <th>Pulsante</th>
                      <th>Icona</th>
                      <th>Significato</th>
                      <th>Specializzazione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buttons.map((button) => (
                      <tr key={`${button.label}:${button.specialty.join()}`}>
                        <td>{button.label}</td>
                        <td>
                          <span
                            className={`guide-icon${button.crossed ? " guide-icon-crossed" : ""}`}
                            style={{
                              color: button.color,
                              borderColor: button.color === "#4f6f6a" ? "#394548" : button.color,
                            }}
                          >
                            <button.icon size={16} />
                          </span>
                        </td>
                        <td>{button.meaning}</td>
                        <td>
                          {(["ranger", "explorer", "builder"] as const).map((key) => {
                            if (!button.specialty.includes(key))
                              return <span aria-hidden="true" className="guide-icon guide-icon-empty" key={key} />;
                            const { icon: Icon, color, name } = specialtyIcons[key];
                            return (
                              <span
                                aria-label={name}
                                className="guide-icon"
                                key={key}
                                style={{ color, borderColor: color }}
                                title={name}
                              >
                                <Icon size={16} />
                              </span>
                            );
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="pulsanti-comuni">
              <h3>Pulsanti generali</h3>
              <p>Pulsanti validi per tutti, indipendentemente dalla specializzazione.</p>
              <div className="guide-table-wrap">
                <table className="guide-table">
                  <thead>
                    <tr>
                      <th>Pulsante</th>
                      <th>Icona</th>
                      <th>Significato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonButtons.map((button) => (
                      <tr key={button.label}>
                        <td>{button.label}</td>
                        <td>
                          <span className="guide-icon" style={{ color: button.color, borderColor: "#394548" }}>
                            <button.icon size={16} />
                          </span>
                        </td>
                        <td>{button.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section id="stazioni">
            {" "}
            <h2 style={{ color: sectionAccents.stations }}>
              <StationIcon aria-hidden="true" size={20} />
              Stazioni
            </h2>
            <h3 id="stazioni-funzionamento">Come funziona una stazione</h3>
            <p>
              Una stazione è un sistema stellare dell&apos;alleanza, identificato da un indirizzo portale e da una
              galassia. Da una stazione possono partire le missioni.
            </p>
            <ul>
              <li>
                Chi la inserisce ne è lo <strong>scopritore</strong>: solo lui può modificarne nome e note, spuntare le
                voci Ranger ed eliminarla (solo se non ha missioni collegate).
              </li>
              <li>
                La scheda mostra il pianeta con i dati di Server Pianeti (se il pianeta è presente nel server), il nome,
                la galassia, lo scopritore e le note. Sotto il nome indica quanti pianeti e quante lune ha il sistema
                (le lune solo se ci sono) e il colore della stella; in basso mostra stella, economia con le sue stelle,
                conflitto con i pallini e razza con la sua icona, gli stessi dati dell&apos;intestazione di Pianeti
                (passando sopra razza, stelle e pallini compare un suggerimento). Un&apos;etichetta segnala se il
                sistema ha un buco nero, un&apos;Interfaccia Atlas o un gigante gassoso. Il titolo della scheda, sotto
                il quale trovi il codice del portale, apre il dettaglio della stazione, con le missioni associate e i
                pianeti del sistema.
              </li>
              <li>
                La scheda stazione ha quattro voci da spuntare: Stazione riscattata, Sistema scansionato, Sistema
                rinominato e Dati sistema caricati. Se l&apos;Esploratore ha già scansionato il sistema, Sistema
                scansionato e Dati sistema caricati appaiono spuntate con il simbolo dell&apos;Esploratore, non si
                possono modificare e non contano nell&apos;avanzamento. Viceversa, se il Ranger o lo scopritore ha già
                scansionato il sistema, Sistema scansionato dell&apos;Esploratore appare spuntato e non modificabile con
                la bussola del Ranger, ed è escluso dall&apos;avanzamento dell&apos;Esploratore. Dati caricati rimane
                invariato.
              </li>
              <li>
                Passa il puntatore su una voce, oppure selezionala con la tastiera, per aprire il tooltip. Nei
                riepiloghi compatti di sola lettura mostra il nome del task e nasconde i quadratini già coperti da
                un&apos;altra specializzazione. Quando il nome è già visibile accanto alla casella modificabile, ne
                descrive il significato. Le descrizioni di Stazione riscattata e Sistema rinominato mostrano il nome
                dell&apos;alleanza configurato; i task presi in carico restano visibili e indicano chi li ha svolti.
              </li>
              <li>
                Le voci Ranger sono condivise tra lo scopritore della stazione e il Ranger con una missione assegnata
                sul sistema: chi spunta per primo una voce ne prende il merito in classifica. L&apos;altro la vede
                spuntata e non modificabile, con l&apos;icona della stazione (scopritore) o la bussola (Ranger); solo
                chi l&apos;ha spuntata può toglierla. Moderatori e amministratori, fuori dalla vista semplice, possono
                sempre modificarla.
              </li>
              <li>
                Le missioni collegate alla stazione ne determinano lo stato: In attesa, In missione o Missione
                completata.
              </li>
            </ul>
            <h3 id="stazioni-creazione">Creare una stazione</h3>
            <ul>
              <li>Usa «{translate("it", "stations.add_station")}» nella pagina Stazioni.</li>
              <li>Indica la galassia e l&apos;indirizzo portale.</li>
              <li>Il nome viene calcolato in base ai glifi, ma puoi modificarlo (max 80 caratteri).</li>
              <li>
                Note (max 1000 caratteri): se ritieni che ci siano informazioni importanti da condividere con chi ci
                andrà in missione.
              </li>
              <li>Diventi lo scopritore della stazione.</li>
              <li>Non puoi inserire una stazione per un sistema già presente.</li>
            </ul>
            <StationFormExample sample={sample} />
            <h4 id="stazioni-controlli-indirizzo-portale">Controlli sull&apos;indirizzo portale</h4>
            <p>
              Mentre inserisci i glifi, il messaggio sotto il campo dell&apos;indirizzo portale ti guida passo per
              passo.
            </p>
            <AddressValidationExample sample={sample} />
            <p>
              «{translate("it", "common.add")}» resta disattivo finché l&apos;indirizzo portale non è valido e il
              controllo su Server Pianeti non è concluso.
            </p>
            <h3 id="stazioni-lista">La lista delle stazioni</h3>
            <h4 id="stazioni-lista-tab" style={{ color: "var(--lime)" }}>
              Tab
            </h4>
            <p>
              In cima alla pagina Stazioni, i tab filtrano la lista; il numero accanto a ogni tab indica quante stazioni
              contiene. I tab senza stazioni non compaiono.
            </p>
            <StationTabsExample />
            <ul>
              <li>
                <strong className="guide-tab-name">{translate("it", "stations.filter_all")}</strong>: tutte le stazioni
                dell&apos;alleanza.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "stations.my_stations")}</strong>: le stazioni di
                cui sei scopritore.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "common.pending_status_label")}</strong>: stazioni
                senza nessuna missione collegata.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "stations.filter_in_mission")}</strong>: stazioni
                con almeno una missione collegata non ancora completata.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "stations.filter_my_missions")}</strong>: stazioni
                con una missione assegnata a te.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "stations.filter_mission_completed")}</strong>:
                stazioni con missioni collegate, tutte completate.
              </li>
            </ul>
            <h4 id="stazioni-lista-ranger" style={{ color: "#5fd68a" }}>
              Ranger
            </h4>
            <ul>
              <li>
                Vede tutte le stazioni e filtra per Tutte, Le mie stazioni, In attesa, In missione, Le mie missioni
                (solo se ne ha) e Missione completata; cerca per indirizzo portale, proprietario, galassia o note.
              </li>
              <li>
                «Aggiungi stazione»: indirizzo portale, galassia, nome (max 80 caratteri), note (max 1000). Solo per sé.
              </li>
              <li>
                Sulle proprie stazioni: spunta le voci Ranger, modifica nome e note, elimina (solo senza missioni
                collegate), crea una missione per Esploratori/Costruttori.
              </li>
            </ul>
            <h5>Esempi di card</h5>
            <p>
              I pulsanti che un Ranger può trovare sulla card di una stazione, in base a chi la possiede e alle missioni
              collegate.
            </p>
            {sample && <RangerStationExamples allianceName={guideAlliance.name} sample={sample} />}
            <h4 id="stazioni-lista-esploratori-costruttori">
              <span style={{ color: "#4d9bff" }}>Esploratori</span> e{" "}
              <span style={{ color: "#ffb45d" }}>Costruttori</span>
            </h4>
            <ul>
              <li>
                Vedono tutte le stazioni; possono modificare ed eliminare (se senza missioni) solo quelle di cui sono
                proprietari, non quelle di altri.
              </li>
              <li>
                Creano una missione per la <strong>propria specializzazione</strong> da una stazione: viene assegnata a
                loro. Non è possibile se la specializzazione è già coperta o se esiste già un altro pianeta dello stesso
                sistema.
              </li>
              <li>
                Se la missione esiste già, un&apos;icona apre il dettaglio della missione per la tua specializzazione,
                con le missioni associate alla stazione come primo blocco; se è di un altro membro compare l&apos;icona
                «+» barrata.
              </li>
            </ul>
            <h5>Esempi di card</h5>
            <p>I pulsanti che un Esploratore o un Costruttore può trovare sulla card di una stazione.</p>
            {sample && <ExplorerBuilderStationExamples allianceName={guideAlliance.name} sample={sample} />}
          </section>

          <section id="missioni">
            <h2 style={{ color: sectionAccents.missions }}>
              <MissionIcon aria-hidden="true" size={20} />
              Missioni
            </h2>
            <h3 id="missioni-funzionamento">Come funziona una missione</h3>
            <p>
              Una missione parte da una stazione. Stati: <strong>In attesa → In corso → Completata</strong>.
            </p>
            <p>
              Le voci spuntate fanno salire l&apos;avanzamento fino all&apos;80%; oltre, fino al 100%, lo porti tu a
              piacere con il cursore, ma non è necessario. «{translate("it", "missions.complete_mission")}» si attiva
              quando le tue voci sono tutte spuntate e puoi completare la missione anche senza arrivare al 100%.
            </p>
            <p>
              Ogni membro vede le missioni per la propria specializzazione (Ranger, Esploratori o Costruttori) che sono
              libere o prese in carico da lui.
            </p>
            <ul>
              <li>
                «{translate("it", "missions.claim")}» su una missione libera: diventa «In corso» e visibile sul tab «Le
                mie missioni».
              </li>
              <li>«{translate("it", "missions.start_mission")}» su una missione assegnata ma in attesa.</li>
              <li>Spunta le tue voci e usa «{translate("it", "missions.complete_mission")}».</li>
              <li>Una missione completata si può riaprire con «{translate("it", "missions.reopen_mission")}».</li>
            </ul>
            <h3 id="missioni-lista">La lista delle missioni</h3>
            <h4 id="missioni-lista-tab" style={{ color: "var(--lime)" }}>
              Tab
            </h4>
            <p>
              In cima alla pagina Missioni, i tab filtrano la lista; il numero accanto a ogni tab indica quante missioni
              contiene. I tab senza missioni non compaiono.
            </p>
            <MissionTabsExample />
            <ul>
              <li>
                <strong className="guide-tab-name">{translate("it", "common.all")}</strong>: tutte le missioni per la
                tua specializzazione prese in carico da te o non ancora assegnate.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "missions.status_in_progress")}</strong>: missioni
                già iniziate da te.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "missions.pending_assigned")}</strong>: missioni in
                attesa assegnate a te, che non hai ancora iniziato.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "missions.pending_unassigned")}</strong>: missioni
                in attesa per la tua specializzazione che nessuno ha ancora preso in carico.
              </li>
              <li>
                <strong className="guide-tab-name">{translate("it", "missions.status_completed")}</strong>: missioni
                concluse da te.
              </li>
            </ul>
            <h4 id="missioni-lista-esploratori" style={{ color: "#4d9bff" }}>
              Esploratori
            </h4>
            <h5>Esempi di card</h5>
            <p>Le schede missione che un Esploratore può trovare, dalla presa in carico alla chiusura.</p>
            <ExplorerMissionExamples allianceName={guideAlliance.name} sample={sample} />
            <h4 id="missioni-lista-costruttori" style={{ color: "#ffb45d" }}>
              Costruttori
            </h4>
            <h5>Esempi di card</h5>
            <p>Le schede missione che un Costruttore può trovare, dalla presa in carico alla chiusura.</p>
            <BuilderMissionExamples allianceName={guideAlliance.name} sample={sample} />
            <h4 id="missioni-lista-ranger" style={{ color: "#5fd68a" }}>
              Ranger
            </h4>
            <p>
              Facoltativo: le voci Ranger (stazione riscattata, sistema rinominato) sono già disponibili allo scopritore
              del sistema sulla scheda stazione, quindi non serve una missione per spuntarle.
            </p>
            <h5>Esempi di card</h5>
            <p>Le schede missione che un Ranger può trovare, dalla presa in carico alla chiusura.</p>
            <RangerMissionExamples allianceName={guideAlliance.name} sample={sample} />
          </section>

          <section id="pianeti">
            <h2 style={{ color: sectionAccents.planets }}>
              <PlanetIcon aria-hidden="true" size={20} />
              Pianeti
            </h2>
            <h3 id="pianeti-funzionamento">Come funziona un pianeta</h3>
            <p>
              Ogni pianeta è legato a un sistema stellare e, se esiste, a una stazione associata. La sezione raccoglie i
              dati di Server Pianeti e li presenta in una lista facile da filtrare.
            </p>
            <ul>
              <li>
                La scheda del pianeta mostra il nome del pianeta, il numero, il sistema, la galassia, la stazione
                collegata e i dati di ambiente (razza, clima, acqua, sentinelle, conflitto, ecc.).
              </li>
              <li>
                Se il pianeta è collegato a una stazione, puoi aprire la stazione direttamente oppure raggiungere la
                scheda del pianeta per leggere le note condivise o lanciare un&apos;aiuto.
              </li>
              <li>
                In basso a destra ogni scheda mostra, da sinistra a destra, il simbolo Paradiso (palma verde, solo se il
                pianeta lo è), il simbolo Dissonante (onda viola, solo se il pianeta lo è), quattro cerchi che indicano
                se il pianeta è Piccolo, Medio, Grande o Enorme (oppure il simbolo della Luna) e una goccia d&apos;acqua
                che si riempie in base alla quantità: vuota se il pianeta è asciutto, un terzo con acqua bassa, due
                terzi con l&apos;oceano e piena con l&apos;acqua profonda.
              </li>
              <li>
                In alto a destra compare la casella personale «Visitato» sui pianeti dei sistemi della tua stazione (se
                ne sei lo scopritore) o della tua missione (se sei Esploratore o Costruttore). Il filtro «Visitati da
                me» mostra i pianeti visitati o ancora da visitare, e il totale di ciascuno entra nella classifica
                «Pianeti visitati». Sugli stessi pianeti, dopo le icone in basso a destra, il pulsante con la sirena
                apre la scheda del pianeta con la richiesta d&apos;aiuto già pronta.
              </li>
              <li>
                Se sul pianeta è registrata una farm, in basso a destra compare il pulsante verde con la fabbrica (prima
                della sirena, se c&apos;è): apre il dettaglio della farm, o della più recente se sono più di una. Se
                c&apos;è anche un pet, il pulsante rosa con la zampa (a sinistra di quello della farm) apre il dettaglio
                del pet più recente, e da lì vedi tutti i pet di quel pianeta.
              </li>
              <li>
                Le informazioni sono raggruppate per sistema/stazione, così puoi vedere subito tutti i pianeti legati a
                una stessa stazione e scorrere le loro caratteristiche.
              </li>
            </ul>
            <h3 id="pianeti-lista">La lista dei pianeti</h3>
            <h4 id="pianeti-ricerca-filtri" style={{ color: "var(--lime)" }}>
              Ricerca e filtri
            </h4>
            <p>
              La barra di ricerca trova i pianeti usando i dati indicizzati da Server Pianeti, il nome del pianeta e
              l&apos;indirizzo portale. Per mostrare i filtri, clicca il pulsante con l&apos;icona a cursori a destra
              della ricerca; cliccalo di nuovo per richiuderli.
            </p>
            <PlanetFiltersExample />
            <p>
              I filtri restringono ulteriormente i risultati. Le opzioni nei menu dipendono dai dati presenti
              nell&apos;archivio. Il filtro «Ricchezza» raggruppa i sistemi per la descrizione economica (per esempio
              Indigente, Promettente, Benestante); il filtro «Sistema speciale» mostra solo i sistemi con un buco nero,
              un&apos;Interfaccia Atlas o un gigante gassoso; il filtro «Visitati da me» compare solo se hai pianeti da
              spuntare e mostra quelli già visitati o ancora da visitare.
            </p>
            <h5>Esempio con i filtri aperti</h5>
            <PlanetFiltersExample initiallyOpen />
            <h5>Esempio con filtri impostati</h5>
            <p>
              Qui sono selezionati “Sì” per Dissonante e Paradiso, per mostrare come appaiono i filtri impostati. È un
              esempio dei controlli, non un pianeta specifico.
            </p>
            <PlanetFiltersExample
              initiallyOpen
              initialFilters={{ ...emptyPlanetFilterValues, dissonant: "yes", paradise: "yes" }}
            />

            <h4 id="pianeti-sistema" style={{ color: "var(--lime)" }}>
              Il sistema
            </h4>

            <p>La lista raggruppa i pianeti in base alla stazione associata.</p>

            <p>
              L&apos;intestazione mostra il nome della stazione, la galassia, l&apos;indirizzo portale e i dati del
              sistema: stella, economia con le sue stelle, conflitto con i pallini e razza con la sua icona (passando
              sopra razza, stelle e pallini compare un suggerimento con il valore esatto). Il pulsante con l&apos;icona
              della stazione apre la stazione nella sezione Stazioni; accanto, il pulsante con l&apos;icona della
              galassia mostra il sistema sulla mappa (marker giallo e pulsante). Se non c&apos;è una stazione associata,
              il gruppo è indicato come «{translate("it", "planet.no_associated_station")}».
            </p>
            <p>
              Se nel sistema c&apos;è un buco nero, un&apos;Interfaccia Atlas o un gigante gassoso (sistema viola con un
              solo pianeta e cinque lune), accanto al nome compare un&apos;etichetta dedicata (viola per il buco nero,
              rossa con il logo di No Man&apos;s Sky per l&apos;Atlas, ambra per il gigante gassoso). La stessa
              etichetta è visibile sulle schede stazione. Si ricava dall&apos;indirizzo portale e non richiede dati
              Almanac.
            </p>
            <PlanetStationHeadingExample planet={planetExample} />

            <h4 id="pianeti-lista-pianeti" style={{ color: "var(--lime)" }}>
              I pianeti
            </h4>
            <p>
              Ogni scheda mostra il nome restituito da Server Pianeti o il numero del pianeta, l&apos;indirizzo portale
              con i glifi e i dati disponibili. Selezionando la scheda si apre il dettaglio del pianeta. Negli esempi
              trovi anche un pianeta che puoi visitare, con la casella «Visitato» in alto a destra: provala, nella guida
              non salva nulla.
            </p>
            <PlanetListExample planet={planetExample} />
          </section>

          <section id="mappa">
            <h2 style={{ color: sectionAccents.map }}>
              <MapIcon aria-hidden="true" size={20} />
              Mappa
            </h2>
            <p>
              La mappa mostra dall&apos;alto una galassia alla volta (Euclide di default; la select «Galassia» elenca
              quelle in cui ci sono stazioni): ogni marker è una regione con almeno una stazione, posizionata in base
              alle coordinate del portale. I cerchi tratteggiati sono guide di distanza dal centro galattico, segnato in
              giallo.
            </p>
            <ul>
              <li>
                Trascina la mappa per spostarti e usa la rotellina o i pulsanti «+» e «−» per ingrandire; il pulsante
                con il mirino mostra di nuovo tutta la galassia.
              </li>
              <li>
                Seleziona un marker (o spostati sul marker con la tastiera e premi Invio): si apre una finestrella con
                il nome della stazione e il link alla sua scheda di dettaglio; si chiude con la X, con Esc o cliccando
                fuori. Un numero sul marker indica più stazioni nella stessa regione, tutte elencate nella finestrella.
              </li>
              <li>
                I colori dei marker sono spiegati dalla legenda a destra: <strong>rosso</strong> il hub
                dell&apos;alleanza, <strong>verde</strong> le stazioni per cui c&apos;è già una missione libera per la
                tua specializzazione o ne puoi ancora creare una (le stesse regole del pulsante «+» sulla scheda
                stazione), <strong>arancione</strong> le tue stazioni (se non c&apos;è nulla da fare),{" "}
                <strong>blu</strong> le altre. Con più stazioni nella stessa regione vince il colore più importante.
              </li>
              <li>
                Il pulsante con l&apos;icona della galassia sulle schede stazione e nell&apos;intestazione del sistema
                in Pianeti apre la mappa sulla galassia giusta: il marker di quel sistema diventa{" "}
                <strong>giallo e pulsante</strong> (lo stesso vale per l&apos;indirizzo{" "}
                <code>/map?galaxy=numero&amp;portal=codice</code>).
              </li>
              <li>
                Vedi le stesse stazioni dell&apos;elenco Stazioni. Quelle senza un indirizzo valido non compaiono e
                vengono solo contate sotto la legenda.
              </li>
            </ul>
          </section>

          <section id="farm">
            <h2 style={{ color: sectionAccents.farms }}>
              <FarmIcon aria-hidden="true" size={20} />
              Farm
            </h2>
            <p>
              Le farm sono i pianeti dove gli alleati coltivano piante o raccolgono materiali. Tutti vedono tutte le
              farm; «Le mie farm» mostra solo le tue.
            </p>
            <ul>
              <li>
                Con «Aggiungi farm» inserisci nome, galassia e glifi del portale: i nomi di sistema e pianeta si
                compilano da soli e puoi cambiarli. Scegli almeno una pianta o un materiale; coordinate e note sono
                facoltative.
              </li>
              <li>
                Il modulo propone piante coltivabili e materiali ottenibili con estrattori minerari o di gas. Per le
                piante, il modulo e la scheda mostrano il prodotto; puoi cercare sia la pianta sia il prodotto. Nei
                filtri delle farm e dei pianeti, se i nomi sono diversi, il prodotto compare tra parentesi dopo il nome
                della pianta.
              </li>
              <li>Le farm che aggiungi sono tue e solo tu puoi modificarle o eliminarle.</li>
              <li>
                Cerca per nome, sistema, pianeta o risorsa; «Filtri» restringe l&apos;elenco per piante e materiali.
              </li>
              <li>
                Il nome della farm apre il suo dettaglio, con il pianeta e, se nel sistema c&apos;è una stazione, anche
                la stazione, le missioni e le richieste d&apos;aiuto. Il pulsante blu con l&apos;orbita apre la
                stazione.
              </li>
              <li>
                Le card dei pianeti hanno il pulsante verde per aprire la farm; stazioni e missioni mostrano le farm del
                loro sistema.
              </li>
            </ul>
            <FarmExamples />
          </section>

          <section id="pet">
            <h2 style={{ color: sectionAccents.pets }}>
              <PetIcon aria-hidden="true" size={20} />
              Pet
            </h2>
            <p>
              I pet sono gli animali che gli alleati hanno trovato sui pianeti. Tutti vedono tutti i pet, in schede con
              paginazione; «I miei pet» mostra solo quelli di cui sei lo scopritore.
            </p>
            <ul>
              <li>
                Con «Aggiungi pet» inserisci nome, tipo (ognuno con la sua icona e il suo colore), classi di
                Combattimento, Agilità e Salute (S, A, B o C), scambio uova, attività, habitat e rarità,
                un&apos;immagine facoltativa, galassia e glifi del portale, nome del pianeta, coordinate e note. Il
                pianeta può non essere in un sistema delle galassie conosciute: l&apos;indirizzo deve solo essere valido
                e Almanac non blocca mai il salvataggio. Attività, habitat e rarità «Sconosciuto» non compaiono sulla
                scheda. Cliccando l&apos;immagine del pet sulla scheda si apre una finestra che la mostra grande.
              </li>
              <li>
                Chi aggiunge un pet ne è lo scopritore; moderatori e admin possono scegliere un altro scopritore o
                lasciarlo non assegnato. Solo lo scopritore, i moderatori e gli admin possono modificare o eliminare un
                pet, e quelli non assegnati sono gestibili solo da moderatori e admin.
              </li>
              <li>
                Cerca per nome, pianeta, scopritore o caratteristiche; «Filtri» restringe l&apos;elenco per tipo,
                attività, habitat, rarità, scambio uova e grado delle tre classi, con le etichette dei filtri attivi che
                puoi rimuovere una a una.
              </li>
              <li>
                Il nome del pet apre il suo dettaglio, con il pianeta e, se nel sistema c&apos;è una stazione, anche la
                stazione, le missioni e le richieste d&apos;aiuto. Dal pulsante rosa sulle card dei pianeti il dettaglio
                elenca tutti i pet di quel pianeta. Il pulsante blu con l&apos;orbita apre la stazione; stazioni e
                missioni mostrano i pet del loro sistema.
              </li>
              <li>
                Se lo scambio uova è disponibile, accanto al nome dello scopritore c&apos;è il pulsante con l&apos;uovo:
                apre il messaggio allo scopritore, con il pet come oggetto. Se lo scopritore sei tu, se il pet non è
                assegnato o se lo scopritore è un profilo offline compare solo l&apos;icona dell&apos;uovo.
              </li>
            </ul>
            <PetExamples />
          </section>

          <section id="classifica">
            <h2 style={{ color: "#e040c8" }}>
              <LeaderboardIcon aria-hidden="true" size={20} />
              Classifica
            </h2>
            <p>La pagina riunisce i risultati dei membri e i numeri complessivi dell&apos;alleanza:</p>
            <ul>
              <li>
                Il riquadro Alleanza mostra il totale di stazioni, missioni, missioni completate, task completati,
                pianeti, membri approvati, farm e pet.
              </li>
              <li>
                Le classifiche individuali mostrano chi ha registrato più stazioni, completato più missioni, visitato
                più pianeti (conta solo quanti, non quali), possiede più farm o è lo scopritore di più pet (quelli non
                assegnati non contano), con un massimo di 10 membri per classifica. Ogni classifica usa l&apos;icona e i
                colori della sua sezione: Stazioni, Missioni, Pianeti, Farm e Pet.
              </li>
              <li>
                Le classifiche dei task sono divise per specializzazione: Ranger, Esploratore e Costruttore. Per ogni
                task vengono mostrati i primi membri (12 posizioni in totale per specializzazione, divise tra i suoi
                task); il completamento è attribuito all&apos;assegnatario della missione corrispondente oppure, se non
                c&apos;è una missione che copre quel task, al proprietario della stazione.
              </li>
            </ul>
            <p>La pagina è di sola lettura.</p>
          </section>
          <section id="servizio-taxi">
            <h2 style={{ color: "#f5c518" }}>
              <TaxiIcon aria-hidden="true" size={20} />
              Servizio taxi
            </h2>
            <p>
              Chiedi un passaggio con «Richiedi un taxi»: scegli la galassia, il punto d&apos;incontro e scrivi un
              messaggio. Per inviare la richiesta devi aver inserito il codice amico nel tuo profilo NMS.
            </p>
            <ul>
              <li>Le richieste e le risposte sono visibili a tutti i membri approvati, anche in vista semplice.</li>
              <li>
                Clicca sul nome del richiedente o di chi risponde per aprire la scheda NMS e trovare il suo codice
                amico.
              </li>
              <li>
                Il punto d&apos;incontro parte da «Offline». Puoi scegliere «Da concordare nelle risposte», l&apos;hub
                dell&apos;alleanza (se configurato) o una stazione. Scrivi nei campi per cercare; il link alla stazione
                apre la scheda della stazione.
              </li>
              <li>
                Puoi rispondere per organizzare il viaggio e cancellare le tue richieste o risposte. Moderatori e admin
                possono eliminare anche quelle altrui.
              </li>
              <li>
                Eliminando una richiesta, elimini tutte le sue risposte. Le richieste taxi non compaiono nei messaggi
                privati o nelle Richieste d&apos;aiuto.
              </li>
              <li>
                Nei tab «In corso» e «Archiviati», l&apos;autore della richiesta e i moderatori/admin possono archiviare
                o ripristinare l&apos;intera conversazione. In vista semplice valgono i permessi da utente. Gli
                archiviati partono chiusi: la freccia mostra messaggio e risposte. Non puoi rispondere finché la
                richiesta non viene ripristinata. Il contatore nel menu include solo le richieste in corso.
              </li>
            </ul>
            <TaxiExamples />
            <p>
              Se abilitati dall&apos;admin, gli alert Taxi arrivano su Discord, nel gruppo Telegram e tramite Web Push,
              con galassia e link al dettaglio, senza il testo completo. Discord e Telegram mostrano anche il codice
              amico del richiedente originale, se valido, anche negli avvisi delle risposte: è visibile ai partecipanti
              del canale o gruppo. Includono anche il ritrovo originale: Offline, da concordare, hub o stazione, con
              indirizzo portale e galassia per hub e stazioni. Se esiste una stazione nello stesso sistema e nella
              stessa galassia del ritrovo, trovi anche il link alla sua scheda, incluso per l&apos;hub. Web Push non
              include il codice amico o il ritrovo. In «Il mio profilo NMS» puoi abilitare le notifiche Taxi e collegare
              ogni browser concedendo il permesso. Non ricevi Push per le tue azioni. Servono HTTPS o localhost; su
              iPhone/iPad aggiungi prima l&apos;app alla schermata Home (iOS 16.4+). La consegna dipende dal browser e
              dal sistema operativo e non è garantita. Aiuto e messaggi privati non generano ancora alert.
            </p>
          </section>
          <section id="richieste-aiuto">
            <h2 style={{ color: "#ff4d4f" }}>
              <HelpRequestIcon aria-hidden="true" size={20} />
              Richieste d&apos;aiuto
            </h2>
            <p>
              Puoi chiedere aiuto dalla scheda di un pianeta, premendo{" "}
              <span
                aria-label="Richiedi aiuto"
                className="guide-icon guide-help-icon"
                style={{ color: "#ff4d4f", borderColor: "#ff4d4f" }}
                title="Richiedi aiuto"
              >
                <HelpRequestIcon aria-hidden="true" size={16} />
              </span>{" "}
              e inviando un messaggio. Le richieste compaiono qui a tutti gli utenti dalla più recente alla meno
              recente.
            </p>
            <ul>
              <li>
                Accanto all&apos;oggetto, l&apos;icona{" "}
                <span
                  aria-label="Pianeta"
                  className="guide-icon"
                  style={{ color: sectionAccents.planets, borderColor: sectionAccents.planets }}
                  title="Pianeta"
                >
                  <PlanetIcon aria-hidden="true" size={16} />
                </span>{" "}
                apre la scheda pianeta collegata alla richiesta d&apos;aiuto.
              </li>
              <li>
                Ogni richiesta mostra chi l&apos;ha inviata e il contenuto, con eventuali collegamenti al pianeta e alla
                missione.
              </li>
              <li>Puoi rispondere alle richieste in corso; le risposte compaiono sotto quella originale.</li>
              <li>
                Come nel Servizio taxi, i tab «In corso» e «Archiviati» separano le conversazioni aperte da quelle
                archiviate. L&apos;autore della richiesta e i moderatori/admin possono archiviare e ripristinare (in
                vista semplice valgono i permessi da utente). Gli archiviati partono chiusi e non accettano nuove
                risposte fino al ripristino. Il contatore nel menu include solo le richieste in corso.
              </li>
              <li>Clicca il nome dell&apos;autore di una richiesta o risposta per consultarne la scheda NMS.</li>
              <li>
                Puoi eliminare le tue richieste e risposte; moderatori e admin possono eliminare anche quelle degli
                altri. Eliminando una richiesta, elimini anche le sue risposte.
              </li>
              <li>
                Per conversazioni lunghe, usa Telegram o Discord: trovi i link nella parte bassa della barra laterale.
              </li>
            </ul>
          </section>
          <section id="messaggi">
            <h2 style={{ color: "var(--lime)" }}>
              <MessagesIcon aria-hidden="true" size={20} />
              Messaggi
            </h2>
            <p>
              Per scrivere a un alleato, clicca sul suo nome in una scheda di{" "}
              <span className="guide-destination guide-destination-stations">
                <StationIcon aria-hidden="true" size={14} />
                Stazioni
              </span>{" "}
              o di{" "}
              <span className="guide-destination guide-destination-missions">
                <MissionIcon aria-hidden="true" size={14} />
                Missioni
              </span>
              , apri il profilo e premi «Lascia un messaggio».
            </p>
            <MessageComposerExamples />
            <p>
              La scheda NMS mostra specializzazione, piattaforme e codice amico nel formato XXXX-XXXX-XXXXX. Il codice
              amico è visibile a tutti i membri approvati, anche in vista semplice. Puoi aprire la scheda anche dai nomi
              di mittente e destinatario nei messaggi e dagli autori delle richieste d&apos;aiuto e delle risposte: in
              questi casi è in sola consultazione, senza il pulsante «Lascia un messaggio». I nomi senza un membro
              associato non sono cliccabili.
            </p>
            <p>
              Qui trovi i messaggi inviati e ricevuti, organizzati in conversazioni. La pagina offre i tab{" "}
              <strong className="guide-tab-name">Ricevuti</strong> e{" "}
              <strong className="guide-tab-name">Inviati.</strong>
            </p>
            <MessageTabsExample />
            <ul>
              <li>Mantieni sempre un tono rispettoso: moderatori e admin possono vedere tutti i messaggi.</li>
              <li>
                Per lo scambio uova di un pet, scrivi allo scopritore dal pulsante con l&apos;uovo sulla scheda del pet:
                il messaggio ha il pet come oggetto e accanto all&apos;oggetto compare l&apos;icona{" "}
                <span
                  aria-label="Pet"
                  className="guide-icon"
                  style={{ color: sectionAccents.pets, borderColor: sectionAccents.pets }}
                  title="Pet"
                >
                  <PetIcon aria-hidden="true" size={16} />
                </span>{" "}
                che apre la scheda del pet.
              </li>
              <li>
                Accanto all&apos;oggetto, l&apos;icona{" "}
                <span
                  aria-label="Missione"
                  className="guide-icon"
                  style={{ color: sectionAccents.missions, borderColor: sectionAccents.missions }}
                  title="Missione"
                >
                  <MissionIcon aria-hidden="true" size={16} />
                </span>{" "}
                apre la scheda missione collegata al messaggio; l&apos;icona{" "}
                <span
                  aria-label="Stazione"
                  className="guide-icon"
                  style={{ color: sectionAccents.stations, borderColor: sectionAccents.stations }}
                  title="Stazione"
                >
                  <StationIcon aria-hidden="true" size={16} />
                </span>{" "}
                apre la scheda stazione collegata al messaggio.
              </li>
              <li>
                Se ricevi un messaggio, l&apos;indicatore dei messaggi non letti compare nella barra laterale entro 2
                minuti.
              </li>
              <li>
                I messaggi mostrano mittente, destinatario, oggetto, data e contenuto; le risposte compaiono sotto il
                messaggio originale.
              </li>
              <li>Puoi rispondere ai messaggi inviati e ricevuti.</li>
              <li>
                Per conversazioni lunghe, usa Telegram o Discord: trovi i link nella parte bassa della barra laterale.
              </li>
            </ul>
          </section>
        </main>
      </LocaleProvider>
    </div>
  );
}
