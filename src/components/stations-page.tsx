"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { CircleAlert, CirclePlus, Plus, Search, Trash2, X } from "lucide-react";
import { AllianceSidebar, DashboardFooter, DashboardTopbar } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { GlyphStrip, SystemAddressField, type SystemAddressValidation } from "@/components/portal-address-field";
import { MissionForm } from "@/components/mission-form";
import { PlanetCard } from "@/components/planet-card";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { decodePortalAddress, missionSpecialties, type Mission, type MissionInput, type MissionSpecialty } from "@/lib/missions";

type CachedPlanet = Readonly<{ galaxy: number; response: Record<string, unknown> }>;
type StationEntry = Readonly<{
  portal: string;
  galaxy: number;
  owner: string;
  planet: CachedPlanet | null;
  hasMissions: boolean;
  availableSpecialties: MissionSpecialty[];
}>;
type StationMissionSeed = Readonly<{ portal: string; galaxy: number; title: string; ownerEmail: string }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseStations(value: unknown): StationEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const station = asRecord(item);
    if (typeof station?.portal !== "string" || typeof station.galaxy !== "number" || typeof station.owner !== "string") return [];
    const response = asRecord(station.planet);
    const planet = response
      ? { galaxy: station.galaxy, response }
      : null;
    const availableSpecialties = Array.isArray(station.availableSpecialties)
      ? station.availableSpecialties.filter((specialty): specialty is MissionSpecialty =>
        missionSpecialties.includes(specialty as MissionSpecialty),
      )
      : [];
    return [{ portal: station.portal, galaxy: station.galaxy, owner: station.owner, planet, hasMissions: station.hasMissions === true, availableSpecialties }];
  });
}

function planetWord(band: Record<string, unknown> | null, key: string) {
  const attribute = band ? asRecord(band[key]) : null;
  return typeof attribute?.word === "string" ? attribute.word : null;
}

function cachedPlanetTitle(planet: CachedPlanet | null) {
  const lines = asRecord(planet?.response.lines);
  const headline = asRecord(lines?.headline);
  return typeof headline?.word === "string" ? headline.word : "";
}

function CachedPlanetInfo({ planet, onOpen }: Readonly<{ planet: CachedPlanet; onOpen: () => void }>) {
  const lines = asRecord(planet.response.lines);
  const band = lines ? asRecord(lines.band) : null;
  const headline = lines ? asRecord(lines.headline) : null;
  const title = typeof headline?.word === "string" ? headline.word : planetWord(band, "type");
  const facts = [
    ["Tipo", planetWord(band, "type")],
    ["Meteo", planetWord(band, "weather")],
    ["Acqua", planetWord(band, "water")],
    ["Stella", planetWord(band, "star")],
    ["Economia", planetWord(band, "economy")],
    ["Razza", planetWord(band, "race")],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <div className="station-planet-info">
      <button className="station-planet-open" onClick={onOpen} type="button" aria-label={`Apri la scheda di ${title || "questo pianeta"}`}>
        <span>{galaxyLabel(planet.galaxy)}</span><strong>{title || "Dati pianeta"}</strong>
      </button>
      <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  );
}

export function StationsPage({ currentMember, alliance, missionCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
}>) {
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [stations, setStations] = useState<StationEntry[]>([]);
  const [selectedStation, setSelectedStation] = useState<{ portal: string; galaxy: number } | null>(null);
  const [missionStation, setMissionStation] = useState<StationMissionSeed | null>(null);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [portal, setPortal] = useState("");
  const [galaxy, setGalaxy] = useState(0);
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: false, lookup: null });
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canSeeAll = pageMember.role === "moderator" || pageMember.role === "admin";
  const canCreateMissions = canSeeAll;
  const visibleStations = useMemo(() => stations.filter((station) =>
    `${station.portal} ${station.owner} ${galaxyLabel(station.galaxy)}`.toLowerCase().includes(search.toLowerCase()),
  ), [search, stations]);

  async function fetchStations() {
    const response = await fetch("/api/stations", { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : "Impossibile caricare le stazioni spaziali.");
    }
    return parseStations(body.stations);
  }

  async function refreshStations() {
    setStations(await fetchStations());
  }

  useEffect(() => {
    fetchStations()
      .then(setStations)
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : "Impossibile caricare le stazioni spaziali."))
      .finally(() => setLoading(false));
    if (canCreateMissions) {
      fetch("/api/members", { cache: "no-store" })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !Array.isArray(body)) throw new Error("Impossibile caricare i membri assegnabili.");
          setMembers(body as AllianceMember[]);
        })
        .catch(() => setMembers([]));
    }
  }, [canCreateMissions]);

  async function addStation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const decoded = decodePortalAddress(portal);
    if (!decoded || decoded.errors.length > 0) {
      setError(decoded?.errors.join(" ") || "Inserisci un indirizzo portale da 12 glifi.");
      return;
    }
    const canonicalPortal = portal.toUpperCase();
    if (stations.some((station) => station.portal === canonicalPortal && station.galaxy === galaxy)) {
      setError("Questo portale è già presente nella tua lista.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: canonicalPortal, galaxy }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : "Impossibile salvare il portale.");
      }
      setStations(parseStations(body.stations));
      setPortal("");
      setValidation({ valid: false, lookup: null });
      setAddOpen(false);
      setNotice("Portale aggiunto alle tue stazioni.");
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Impossibile salvare il portale.");
    } finally {
      setSaving(false);
    }
  }

  async function removeStation(stationPortal: string, stationGalaxy: number) {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: stationPortal, galaxy: stationGalaxy }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : "Impossibile rimuovere il portale.");
      }
      setStations(parseStations(body.stations));
      setNotice("Portale rimosso dalle tue stazioni.");
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Impossibile rimuovere il portale.");
    }
  }

  async function createMissionFromStation(input: MissionInput) {
    const response = await fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (!response.ok || !Array.isArray(body)) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : "Impossibile creare la missione.");
    }
    const created = body as Mission[];
    setNotice(created.length > 1 ? `Create ${created.length} missioni dalla stazione.` : "Missione creata dalla stazione.");
    try {
      await refreshStations();
    } catch {
      setError("Missione creata, ma non è stato possibile aggiornare i target della stazione.");
    }
  }

  return (
    <div className="app-shell">
      <AllianceSidebar activeSection="stazioni" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="Stazioni" />
        <main className="members-page stations-page">
          <header className="members-page-header">
            <Link aria-label="Torna alle missioni" className="members-back" href="/">Missioni</Link>
            <div className="station-page-title-row">
              <div><span className="eyebrow">{canSeeAll ? "ARCHIVIO ALLEANZA" : "ARCHIVIO PERSONALE"}</span><h1>{canSeeAll ? "Stazioni spaziali" : "Le mie stazioni spaziali"}<span>.</span></h1></div>
              <button className="primary-button" onClick={() => {
                setPortal("");
                setGalaxy(0);
                setValidation({ valid: false, lookup: null });
                setError("");
                setAddOpen(true);
              }} type="button"><Plus size={15} /> Aggiungi stazione</button>
            </div>
          </header>

          {(error || notice) && <p className={error ? "form-error" : "address-validation address-valid"}>{error ? <CircleAlert size={15} /> : null}{error || notice}</p>}

          <section aria-label="Le mie stazioni spaziali" className="station-list-section">
            <div className="station-list-heading"><h2>Portali salvati</h2><span>{visibleStations.length}</span></div>
            <label className="search-field station-search"><Search size={15} /><input aria-label="Cerca stazioni per portale, proprietario o galassia" onChange={(event) => setSearch(event.target.value)} placeholder="Cerca portale, utente o galassia" value={search} /></label>
            {loading && <p className="station-list-empty">Caricamento…</p>}
            {!loading && visibleStations.length === 0 && <p className="station-list-empty">{search ? "Nessuna stazione trovata." : "Nessun portale salvato."}</p>}
            {visibleStations.length > 0 && <ul className="station-list">{visibleStations.map((station) => <li key={`${station.portal}:${station.galaxy}`}>
              <div className="station-portal-code"><GlyphStrip address={station.portal} /><code>{station.portal}</code>{canSeeAll && <span className="station-owner">{station.owner}</span>}</div>
              <div className="station-planet-info-list">
                {station.planet
                  ? <CachedPlanetInfo onOpen={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} planet={station.planet} />
                  : <button className="station-planet-open station-planet-unknown" onClick={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} type="button"><span>{galaxyLabel(station.galaxy)}</span><strong>Nessun dato Almanac · apri scheda</strong></button>}
              </div>
              <div className="station-actions">
                {canCreateMissions && station.availableSpecialties.length > 0 && <button aria-label={`Crea missione da ${station.portal}`} className="member-icon-action create-station-mission" onClick={() => setMissionStation({ portal: station.portal, galaxy: station.galaxy, title: cachedPlanetTitle(station.planet), ownerEmail: station.owner })} title="Crea missione"><CirclePlus size={14} /></button>}
                {station.hasMissions
                  ? <span className="station-mission-lock">Missione associata</span>
                  : station.owner.toLowerCase() === pageMember.email.toLowerCase() && <button aria-label={`Rimuovi il portale ${station.portal} in ${galaxyLabel(station.galaxy)}`} className="member-icon-action delete-member" onClick={() => void removeStation(station.portal, station.galaxy)} title="Rimuovi stazione" type="button"><Trash2 size={14} /></button>}
              </div>
            </li>)}</ul>}
          </section>
          <DashboardFooter />
        </main>
      </section>
      {addOpen && <div className="dialog-backdrop">
        <dialog aria-labelledby="station-dialog-title" aria-modal="true" className="mission-dialog station-dialog" open>
          <div className="dialog-heading">
            <div><span className="eyebrow">ARCHIVIO PERSONALE</span><h2 id="station-dialog-title">Aggiungi stazione</h2></div>
            <button aria-label="Chiudi" className="icon-button" onClick={() => setAddOpen(false)} type="button"><X size={18} /></button>
          </div>
          <form className="station-add-form" onSubmit={addStation}>
            <SystemAddressField address={portal} galaxy={undefined} onChange={(value) => {
              setPortal(value);
              setError("");
              setValidation({ valid: false, lookup: null });
            }} onStateChange={setValidation} />
            <label className="field station-galaxy-select">
              <span>Galassia</span>
              <select onChange={(event) => setGalaxy(Number(event.target.value))} value={galaxy}>
                {galaxyNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </label>
            {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
            <div className="dialog-actions">
              <span className="action-spacer" />
              <button className="quiet-button" onClick={() => setAddOpen(false)} type="button">Annulla</button>
              <button className="primary-button" disabled={saving || !validation.valid} type="submit">{saving ? "Salvataggio…" : "Aggiungi"}<Plus size={15} /></button>
            </div>
          </form>
        </dialog>
      </div>}
      {selectedStation && <PlanetCard
        contextLabel={galaxyLabel(selectedStation.galaxy)}
        galaxy={selectedStation.galaxy}
        onClose={() => setSelectedStation(null)}
        portal={selectedStation.portal}
        title="Stazione spaziale"
      />}
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} />}
      {missionStation && <MissionForm
        availableSpecialties={stations.find((station) => station.portal === missionStation.portal && station.galaxy === missionStation.galaxy)?.availableSpecialties}
        initialValues={{
          title: missionStation.title,
          systemAddress: missionStation.portal,
          galaxy: missionStation.galaxy,
          stationOwnerEmail: missionStation.ownerEmail,
          targetSpecialty: stations.find((station) => station.portal === missionStation.portal && station.galaxy === missionStation.galaxy)?.availableSpecialties[0] ?? "builder",
        }}
        members={members}
        mission={null}
        onClose={() => setMissionStation(null)}
        onDelete={async () => undefined}
        onSave={(input) => createMissionFromStation({ ...input, stationOwnerEmail: missionStation.ownerEmail })}
      />}
    </div>
  );
}