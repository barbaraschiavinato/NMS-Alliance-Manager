"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { CircleAlert, CirclePlus, Crosshair, LayoutGrid, List, Plus, Search, Trash2, X } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { GlyphStrip, SystemAddressField, type SystemAddressValidation } from "@/components/portal-address-field";
import { MissionForm } from "@/components/mission-form";
import { PlanetCard } from "@/components/planet-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { decodePortalAddress, missionSpecialties, type Mission, type MissionInput, type MissionSpecialty } from "@/lib/missions";
import { useLocale } from "@/components/locale-provider";

type CachedPlanet = Readonly<{ galaxy: number; response: Record<string, unknown> }>;
type StationEntry = Readonly<{
  portal: string;
  galaxy: number;
  owner: string;
  name?: string;
  planet: CachedPlanet | null;
  hasMissions: boolean;
  availableSpecialties: MissionSpecialty[];
}>;
type StationMissionSeed = Readonly<{ portal: string; galaxy: number; title: string; ownerEmail: string }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cachedPlanetType(planet: CachedPlanet | null) {
  const title = cachedPlanetTitle(planet);
  if (title) return title;
  const lines = asRecord(planet?.response.lines);
  return planetWord(asRecord(lines?.band), "type") ?? "";
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
    return [{
      portal: station.portal,
      galaxy: station.galaxy,
      owner: station.owner,
      ...(typeof station.name === "string" ? { name: station.name } : {}),
      planet,
      hasMissions: station.hasMissions === true,
      availableSpecialties,
    }];
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

function cachedPlanetImageUrl(planet: CachedPlanet | null) {
  const pictures = asRecord(planet?.response.pictures);
  const disc = pictures?.disc;
  return typeof disc === "string" && disc.startsWith("/planets/")
    ? `https://nmsalmanac.com/api${disc}`
    : null;
}

function CachedPlanetInfo({ planet, onOpen }: Readonly<{ planet: CachedPlanet; onOpen: () => void }>) {
  const { t } = useLocale();
  const lines = asRecord(planet.response.lines);
  const band = lines ? asRecord(lines.band) : null;
  const headline = lines ? asRecord(lines.headline) : null;
  const title = typeof headline?.word === "string" ? headline.word : planetWord(band, "type");
  const facts = [
    [t("Type"), planetWord(band, "type")],
    [t("Weather"), planetWord(band, "weather")],
    [t("Water"), planetWord(band, "water")],
    [t("Star"), planetWord(band, "star")],
    [t("Economy"), planetWord(band, "economy")],
    [t("Race"), planetWord(band, "race")],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <div className="station-planet-info">
      <button className="station-planet-open" onClick={onOpen} type="button" aria-label={`${t("Open details for")} ${title || t("this planet")}`}>
        <span>{galaxyLabel(planet.galaxy)}</span><strong>{title || t("Planet data")}</strong>
      </button>
      <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  );
}

export function StationsPage({ currentMember, alliance, missionCount, initialSearch = "", sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  initialSearch?: string;
  sidebarStationCount: number;
  sidebarUserCount?: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [stations, setStations] = useState<StationEntry[]>([]);
  const [selectedStation, setSelectedStation] = useState<{ portal: string; galaxy: number } | null>(null);
  const [missionStation, setMissionStation] = useState<StationMissionSeed | null>(null);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const [portal, setPortal] = useState("");
  const [galaxy, setGalaxy] = useState(0);
  const [stationOwnerEmail, setStationOwnerEmail] = useState(currentMember.email);
  const [stationName, setStationName] = useState("");
  const [planetType, setPlanetType] = useState("");
  const [stationNameEdited, setStationNameEdited] = useState(false);
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: false, lookup: null });
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canSeeAll = pageMember.role === "moderator" || pageMember.role === "admin";
  const canCreateMissions = canSeeAll;
  const viewMode = viewOverride ?? allianceSettings.defaultTableView;
  const visibleStations = useMemo(() => stations.filter((station) =>
    `${station.name ?? cachedPlanetType(station.planet)} ${station.portal} ${station.owner} ${galaxyLabel(station.galaxy)}`.toLowerCase().includes(search.toLowerCase()),
  ), [search, stations]);

  async function fetchStations() {
    const response = await fetch("/api/stations", { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : "Unable to load space stations.");
    }
    return parseStations(body.stations);
  }

  async function refreshStations() {
    setStations(await fetchStations());
  }

  function openAddStation() {
    setPortal("");
    setGalaxy(0);
    setStationOwnerEmail(pageMember.email);
    setStationName("");
    setPlanetType("");
    setStationNameEdited(false);
    setValidation({ valid: false, lookup: null });
    setError("");
    setAddOpen(true);
  }

  useEffect(() => {
    fetchStations()
      .then(setStations)
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : t("Unable to load space stations.")))
      .finally(() => setLoading(false));
    if (canCreateMissions) {
      fetch("/api/members", { cache: "no-store" })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !Array.isArray(body)) throw new Error("Unable to load assignable members.");
          setMembers(body as AllianceMember[]);
        })
        .catch((error_: unknown) => {
          setMembers([]);
          setError(error_ instanceof Error ? error_.message : t("Unable to load members."));
        });
    }
  }, [canCreateMissions, t]);

  function handleStationLookup(lookup: NonNullable<SystemAddressValidation["lookup"]>) {
    const nextPlanetType = lookup.planetType?.trim() ?? "";
    setPlanetType(nextPlanetType);
    if (!stationNameEdited) setStationName(nextPlanetType);
  }

  async function addStation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const decoded = decodePortalAddress(portal);
    if (!decoded || decoded.errors.length > 0) {
      setError(decoded?.errors.join(" ") || "Enter a 12-glyph portal address.");
      return;
    }
    const canonicalPortal = portal.toUpperCase();
    const requestedOwner = canSeeAll ? stationOwnerEmail.trim().toLowerCase() : pageMember.email.toLowerCase();
    if (!requestedOwner) {
      setError("Select the station owner.");
      return;
    }
    if (stations.some((station) =>
      station.portal === canonicalPortal && station.galaxy === galaxy && station.owner.toLowerCase() === requestedOwner,
    )) {
      setError("This portal is already in the selected owner's list.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: canonicalPortal, galaxy, owner: requestedOwner, name: stationName }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : "Unable to save the portal.");
      }
      setStations(parseStations(body.stations));
      setPortal("");
      setStationName("");
      setPlanetType("");
      setStationNameEdited(false);
      setValidation({ valid: false, lookup: null });
      setAddOpen(false);
      setNotice(canSeeAll && requestedOwner !== pageMember.email.toLowerCase()
        ? t("Station added to {owner}'s archive.", { owner: members.find((candidate) => candidate.email.toLowerCase() === requestedOwner)?.nmsName || members.find((candidate) => candidate.email.toLowerCase() === requestedOwner)?.name || requestedOwner })
        : t("Portal added to your stations."));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Unable to save the portal.");
    } finally {
      setSaving(false);
    }
  }

  async function removeStation(stationPortal: string, stationGalaxy: number, owner: string) {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: stationPortal, galaxy: stationGalaxy, owner }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : "Unable to remove the portal.");
      }
      setStations(parseStations(body.stations));
      setNotice(t("Station removed from the owner's archive."));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Unable to remove the portal.");
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
      throw new Error(typeof message === "string" ? message : "Unable to create the mission.");
    }
    const created = body as Mission[];
    setNotice(created.length > 1
      ? t("{count} missions created from the station.", { count: created.length })
      : t("Mission created from station."));
    try {
      await refreshStations();
    } catch {
      setError("Mission created, but station targets could not be updated.");
    }
  }

  return (
    <div className="app-shell">
      <AllianceSidebar activeSection="stazioni" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={loading ? sidebarStationCount : stations.length} userCount={sidebarUserCount} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle={t("Stations")} settings={allianceSettings} />
        <MissionHero
          actionLabel={t("Add station")}
          description={t(canSeeAll ? "Browse alliance-registered portals and their planets." : "Register portals for systems you have discovered.")}
          onCreate={openAddStation}
          settings={allianceSettings}
          showCreate
          title={t(canSeeAll ? "Space stations" : "My stations")}
        />
        <main className="content-wrap stations-page">
          {(error || notice) && <p className={error ? "form-error" : "address-validation address-valid"}>{error ? <CircleAlert size={15} /> : null}{t(error || notice)}</p>}

          <section aria-label={t("My space stations")} className="station-list-section">
            <div className="station-list-heading">
              <h2>{t("Saved portals")}</h2>
              <div className="station-list-heading-tools">
                <span className="station-count">{visibleStations.length}</span>
                <label className="search-field station-search"><Search size={15} /><input aria-label={t("Search stations by portal, owner, or galaxy")} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search portal, user, or galaxy")} value={search} /></label>
                <div aria-label={t("Station view")} className="view-toggle" role="group">
                  <button aria-label={t("List view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("List view")} type="button"><List size={15} /></button>
                  <button aria-label={t("Card view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("Card view")} type="button"><LayoutGrid size={15} /></button>
                </div>
              </div>
            </div>
            {loading && <div className="station-list-empty station-list-loading"><LoadingSpinner /></div>}
            {!loading && visibleStations.length === 0 && <p className="station-list-empty">{t(search ? "No stations found." : "No saved portals.")}</p>}
            {visibleStations.length > 0 && <ul className={`station-list ${viewMode === "cards" ? "station-list-cards" : ""}`}>{visibleStations.map((station) => {
              const planetImageUrl = cachedPlanetImageUrl(station.planet);
              const stationDisplayName = station.name || cachedPlanetType(station.planet) || cachedPlanetTitle(station.planet) || t("Unnamed planet");
              return <li key={`${station.portal}:${station.galaxy}:${station.owner}`}>
                {viewMode === "cards" && <button className={`station-card-title${planetImageUrl ? " station-card-title-with-image" : ""}`} onClick={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} type="button">
                  {planetImageUrl && <Image alt="" className="station-card-planet-image" height={112} src={planetImageUrl} unoptimized width={112} />}
                  <span className="station-card-title-copy">
                    <span>{galaxyLabel(station.galaxy)}</span>
                    <strong>{stationDisplayName}</strong>
                  </span>
                </button>}
                <div className="station-portal-code"><strong className="station-name">{stationDisplayName}</strong><GlyphStrip address={station.portal} /><code>{station.portal}</code>{canSeeAll && <span className="station-owner">{station.owner}</span>}</div>
                <div className="station-planet-info-list">
                  {station.planet
                    ? <CachedPlanetInfo onOpen={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} planet={station.planet} />
                    : viewMode === "cards"
                      ? <p className="station-card-no-planet">{t("No Almanac data")}</p>
                      : <button className="station-planet-open station-planet-unknown" onClick={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} type="button"><span>{galaxyLabel(station.galaxy)}</span><strong>{t("No Almanac data · open details")}</strong></button>}
                </div>
                <div className="station-actions">
                  {canCreateMissions && station.availableSpecialties.length > 0 && <button aria-label={t("Create mission from {portal}", { portal: station.portal })} className="member-icon-action create-station-mission" data-tooltip={t("Create mission from station")} onClick={() => setMissionStation({ portal: station.portal, galaxy: station.galaxy, title: cachedPlanetTitle(station.planet), ownerEmail: station.owner })} type="button"><CirclePlus size={14} /></button>}
                  {station.hasMissions
                    ? canSeeAll
                      ? <Link aria-label={t("Open missions for planet {portal}", { portal: station.portal })} className="member-icon-action station-missions-link" data-tooltip={t("Open associated missions")} href={`/?search=${encodeURIComponent(station.portal)}`}><Crosshair size={14} /></Link>
                      : <span className="station-mission-lock">{t("Associated mission")}</span>
                    : (canSeeAll || station.owner.toLowerCase() === pageMember.email.toLowerCase()) && <button aria-label={t("Remove portal {portal} in {galaxy} from {owner}'s archive", { portal: station.portal, galaxy: galaxyLabel(station.galaxy), owner: station.owner })} className="member-icon-action delete-member" data-tooltip={t("Delete station")} onClick={() => void removeStation(station.portal, station.galaxy, station.owner)} type="button"><Trash2 size={14} /></button>}
                </div>
              </li>;
            })}</ul>}
          </section>
        </main>
      </section>
      {addOpen && <div className="dialog-backdrop">
        <dialog aria-labelledby="station-dialog-title" aria-modal="true" className="mission-dialog station-dialog" open>
          <div className="dialog-heading">
            <div><span className="eyebrow">{t(canSeeAll ? "STATION ARCHIVE" : "PERSONAL ARCHIVE")}</span><h2 id="station-dialog-title">{t("Add station")}</h2></div>
              <button aria-label={t("Close")} className="icon-button" onClick={() => setAddOpen(false)} type="button"><X size={18} /></button>
          </div>
          <form className="station-add-form" onSubmit={addStation}>
            <label className="field full-field station-name-field">
              <span>{t("Station name")} <small>{t("editable · max 80 characters")}</small></span>
              <input
                aria-label={t("Station name")}
                maxLength={80}
                onChange={(event) => {
                  setStationName(event.target.value);
                  setStationNameEdited(true);
                }}
                placeholder={planetType || t("E.g. Large irradiated planet")}
                value={stationName}
              />
            </label>
            <SystemAddressField address={portal} galaxy={galaxy} onChange={(value) => {
              setPortal(value);
              setStationName("");
              setPlanetType("");
              setStationNameEdited(false);
              setError("");
              setValidation({ valid: false, lookup: null });
            }} onLookupResolved={handleStationLookup} onStateChange={setValidation} />
            <label className="field station-galaxy-select">
              <span>{t("Galaxy")}</span>
              <select onChange={(event) => {
                setGalaxy(Number(event.target.value));
                setStationName("");
                setPlanetType("");
                setStationNameEdited(false);
                setValidation({ valid: false, lookup: null });
              }} value={galaxy}>
                {galaxyNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </label>
            {canSeeAll && <label className="field">
              <span>{t("Station owner")}</span>
              <select onChange={(event) => setStationOwnerEmail(event.target.value)} required value={stationOwnerEmail}>
                {[pageMember, ...members.filter((candidate) => candidate.email.toLowerCase() !== pageMember.email.toLowerCase())]
                  .map((candidate) => (
                    <option key={candidate.email} value={candidate.email}>
                      {candidate.nmsName || candidate.name} · {candidate.email}
                    </option>
                  ))}
              </select>
            </label>}
            {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
            <div className="dialog-actions">
              <span className="action-spacer" />
              <button className="quiet-button" onClick={() => setAddOpen(false)} type="button">{t("Cancel")}</button>
              <button className="primary-button" disabled={saving || !validation.valid} type="submit">{saving ? t("Saving…") : t("Add")}<Plus size={15} /></button>
            </div>
          </form>
        </dialog>
      </div>}
      {selectedStation && <PlanetCard
        contextLabel={galaxyLabel(selectedStation.galaxy)}
        galaxy={selectedStation.galaxy}
        onClose={() => setSelectedStation(null)}
        portal={selectedStation.portal}
        title={t("Space station")}
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
        stationOwners={stations}
      />}
    </div>
  );
}