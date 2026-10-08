"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { CircleAlert, CirclePlus, Crosshair, FileText, Eye, EyeOff, LayoutGrid, List, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { GlyphStrip, SystemAddressField, type SystemAddressValidation } from "@/components/portal-address-field";
import { MissionForm } from "@/components/mission-form";
import { StationSystemCoreInfo } from "@/components/station-system-core-info";
import { PlanetCard } from "@/components/planet-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { MemberCardDialog, type MemberMessageContext } from "@/components/member-card-dialog";
import { MissionSystemProgress } from "@/components/mission-system-progress";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { decodePortalAddress, missionSpecialties, portalSearchMatches, type Mission, type MissionInput, type MissionSpecialty } from "@/lib/missions";
import { editableSystemStatusRoles, isMissionSystemStatus, planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useLocale } from "@/components/locale-provider";
import { useNavigationSearchState } from "@/components/navigation-search-reset";

type CachedPlanet = Readonly<{ galaxy: number; response: Record<string, unknown> }>;
type StationMissionStatus = "none" | "in_progress" | "completed";
type StationFilter = "all" | "pending" | "in_progress" | "completed" | "notes";
type StationEntry = Readonly<{
  portal: string;
  galaxy: number;
  ownerId: string;
  ownerName?: string;
  ownerNmsName?: string;
  ownerImage?: string;
  createdByMemberId?: string;
  name?: string;
  note?: string;
  planet: CachedPlanet | null;
  hasMissions: boolean;
  missionStatus: StationMissionStatus;
  availableSpecialties: MissionSpecialty[];
}>;
type StationMissionSeed = Readonly<{ portal: string; galaxy: number; title: string; ownerMemberId: string }>;

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
    if (typeof station?.portal !== "string" || typeof station.galaxy !== "number" || typeof station.ownerId !== "string") return [];
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
      ownerId: station.ownerId,
      ...(typeof station.ownerName === "string" ? { ownerName: station.ownerName } : {}),
      ...(typeof station.ownerNmsName === "string" ? { ownerNmsName: station.ownerNmsName } : {}),
      ...(typeof station.ownerImage === "string" ? { ownerImage: station.ownerImage } : {}),
      ...(typeof station.createdByMemberId === "string" ? { createdByMemberId: station.createdByMemberId } : {}),
      ...(typeof station.name === "string" ? { name: station.name } : {}),
      ...(typeof station.note === "string" ? { note: station.note } : {}),
      planet,
      hasMissions: station.hasMissions === true,
      missionStatus: station.missionStatus === "in_progress" || station.missionStatus === "completed"
        ? station.missionStatus
        : "none",
      availableSpecialties,
    }];
  });
}

function parsePlanetSystemStatuses(value: unknown): PlanetSystemStatuses {
  const statuses = asRecord(value);
  if (!statuses) throw new Error("Invalid system status response.");
  return Object.fromEntries(Object.entries(statuses).map(([key, values]) => {
    if (!Array.isArray(values) || !values.every(isMissionSystemStatus)) {
      throw new Error("Invalid system status response.");
    }
    return [key, [...new Set(values)]];
  }));
}

function stationOwnerName(station: StationEntry) {
  const profileName = station.ownerName?.trim();
  if (profileName && !profileName.includes("@")) return profileName;
  return "Former member";
}

function StationOwnerCell({ station, onOpenProfile, ownerLabel }: Readonly<{
  station: StationEntry;
  onOpenProfile: (memberId: string) => void;
  ownerLabel: string;
}>) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = stationOwnerName(station);
  const initials = name.slice(0, 2).toUpperCase() || "—";

  return <div className="station-owner-card">
    <small>{ownerLabel}</small>
    <button className="assignee-cell mission-member-link station-owner-link" onClick={() => onOpenProfile(station.ownerId)} type="button">
      <span aria-hidden="true" className={`assignee-avatar ${station.ownerImage && !imageFailed ? "assignee-avatar-image" : ""}`}>
        {station.ownerImage && !imageFailed
          ? <Image alt="" height={21} onError={() => setImageFailed(true)} src={station.ownerImage} unoptimized width={21} />
          : initials}
      </span>
      {name}
    </button>
  </div>;
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
    [t("common.planet_type_label"), planetWord(band, "type")],
    [t("planet.weather"), planetWord(band, "weather")],
    [t("planet.water"), planetWord(band, "water")],
    [t("planet.star"), planetWord(band, "star")],
    [t("common.economy"), planetWord(band, "economy")],
    [t("common.race"), planetWord(band, "race")],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <div className="station-planet-info">
      <button className="station-planet-open" onClick={onOpen} type="button" aria-label={`${t("common.open_details_for")} ${title || t("planet.this_planet")}`}>
        <span>{galaxyLabel(planet.galaxy)}</span><strong>{title || t("planet.planet_data")}</strong>
      </button>
      <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  );
}

export function StationsPage({ currentMember, alliance, missionCount, initialSearch = "", initialStation = null, sidebarOfflineCount, sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  initialSearch?: string;
  initialStation?: Readonly<{ portal: string; galaxy: number; ownerId: string }> | null;
  sidebarStationCount: number;
  sidebarOfflineCount?: number;
  sidebarUserCount?: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [stations, setStations] = useState<StationEntry[]>([]);
  const [planetStatuses, setPlanetStatuses] = useState<PlanetSystemStatuses>({});
  const [planetStatusesLoaded, setPlanetStatusesLoaded] = useState(false);
  const [savingStatusKeys, setSavingStatusKeys] = useState<string[]>([]);
  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [selectedStation, setSelectedStation] = useState<{ portal: string; galaxy: number } | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ memberId: string; messageContext: MemberMessageContext } | null>(null);
  const [stationNoteView, setStationNoteView] = useState<{ portal: string; note: string } | null>(null);
  const [missionStation, setMissionStation] = useState<StationMissionSeed | null>(null);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const [portal, setPortal] = useState("");
  const [galaxy, setGalaxy] = useState(0);
  const [stationOwnerId, setStationOwnerId] = useState(currentMember.publicId);
  const [stationName, setStationName] = useState("");
  const [stationNote, setStationNote] = useState("");
  const [planetType, setPlanetType] = useState("");
  const [stationNameEdited, setStationNameEdited] = useState(false);
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: false, lookup: null });
  const [addOpen, setAddOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useNavigationSearchState(initialSearch);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canSeeAll = pageMember.role === "moderator" || pageMember.role === "admin";
  const canCreateMissions = canSeeAll;
  const missionStationRow = missionStation
    ? stations.find((station) => station.portal === missionStation.portal && station.galaxy === missionStation.galaxy)
    : undefined;
  const isRanger = pageMember.specialty === "ranger";
  const [showAllStations, setShowAllStations] = useState(true);
  const viewMode = pageMember.simpleView ? "cards" : viewOverride ?? allianceSettings.defaultTableView;
  const searchedStations = useMemo(() => stations.filter((station) =>
    (showAllStations || station.ownerId === pageMember.publicId) &&
    (!initialStation || (
      station.portal === initialStation.portal &&
      station.galaxy === initialStation.galaxy &&
      station.ownerId === initialStation.ownerId
    )) &&
    (`${station.name ?? cachedPlanetType(station.planet)} ${station.note ?? ""} ${station.portal} ${station.ownerNmsName ?? ""} ${station.ownerName ?? ""} ${galaxyLabel(station.galaxy)}`.toLowerCase().includes(search.toLowerCase()) ||
      portalSearchMatches(station.portal, search)),
  ), [initialStation, pageMember.publicId, search, showAllStations, stations]);
  const stationCounts: Record<StationFilter, number> = {
    all: searchedStations.length,
    pending: searchedStations.filter((station) => station.missionStatus === "none").length,
    in_progress: searchedStations.filter((station) => station.missionStatus === "in_progress").length,
    completed: searchedStations.filter((station) => station.missionStatus === "completed").length,
    notes: searchedStations.filter((station) => Boolean(station.note?.trim())).length,
  };
  const visibleStations = stationFilter === "all"
    ? searchedStations
    : stationFilter === "notes"
      ? canSeeAll ? searchedStations.filter((station) => Boolean(station.note?.trim())) : searchedStations
      : searchedStations.filter((station) => station.missionStatus === (stationFilter === "pending" ? "none" : stationFilter));

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
    setEditingStation(null);
    setPortal("");
    setGalaxy(0);
    setStationOwnerId(pageMember.publicId);
    setStationName("");
    setStationNote("");
    setPlanetType("");
    setStationNameEdited(false);
    setValidation({ valid: false, lookup: null });
    setError("");
    setAddOpen(true);
  }

  function openEditStation(station: StationEntry) {
    setEditingStation(station);
    setPortal(station.portal);
    setGalaxy(station.galaxy);
    setStationOwnerId(station.ownerId);
    setStationName(station.name ?? cachedPlanetTitle(station.planet) ?? "");
    setStationNote(station.note ?? "");
    setPlanetType(cachedPlanetType(station.planet));
    setStationNameEdited(true);
    setValidation({ valid: true, lookup: null });
    setError("");
    setAddOpen(true);
  }

  function closeStationDialog() {
    setAddOpen(false);
    setEditingStation(null);
  }

  useEffect(() => {
    fetchStations()
      .then(setStations)
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_space_stations")))
      .finally(() => setLoading(false));
    if (canCreateMissions) {
      fetch("/api/members", { cache: "no-store" })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !Array.isArray(body)) throw new Error(t("errors.unable_to_load_members"));
          setMembers(body as AllianceMember[]);
        })
        .catch((error_: unknown) => {
          setMembers([]);
          setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_members"));
        });
    }
  }, [canCreateMissions, t]);

  useEffect(() => {
    if (!canSeeAll) return;
    const controller = new AbortController();
    fetch("/api/planet-status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        const record = asRecord(body);
        if (!response.ok || !record || !("planets" in record)) {
          const message = record && typeof record.error === "string" ? record.error : t("errors.request_failed");
          throw new Error(message);
        }
        setPlanetStatuses(parsePlanetSystemStatuses(record.planets));
        setPlanetStatusesLoaded(true);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : t("errors.request_failed"));
      });
    return () => controller.abort();
  }, [canSeeAll, t]);

  async function toggleStationSystemStatus(portal: string, stationGalaxy: number, status: MissionSystemStatus, checked: boolean) {
    const key = planetSystemStatusKey(portal, stationGalaxy);
    if (savingStatusKeys.includes(key)) return;
    const currentStatuses = planetStatuses[key] ?? [];
    const nextStatuses = checked
      ? [...currentStatuses, status]
      : currentStatuses.filter((selected) => selected !== status);
    setSavingStatusKeys((current) => [...current, key]);
    setError("");
    try {
      const response = await fetch("/api/planet-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal, galaxy: stationGalaxy, systemStatuses: nextStatuses }),
      });
      const body: unknown = await response.json();
      const record = asRecord(body);
      if (!response.ok || !record || !Array.isArray(record.systemStatuses) || !record.systemStatuses.every(isMissionSystemStatus)) {
        const message = record && typeof record.error === "string" ? record.error : t("errors.request_failed");
        throw new Error(message);
      }
      const savedStatuses = record.systemStatuses.filter(isMissionSystemStatus);
      setPlanetStatuses((current) => ({
        ...current,
        [key]: [...new Set(savedStatuses)],
      }));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.request_failed"));
    } finally {
      setSavingStatusKeys((current) => current.filter((savingKey) => savingKey !== key));
    }
  }

  function handleStationLookup(lookup: NonNullable<SystemAddressValidation["lookup"]>) {
    const nextPlanetType = lookup.planetType?.trim() ?? "";
    setPlanetType(nextPlanetType);
    if (!stationNameEdited) setStationName(nextPlanetType);
  }

  async function addStation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const decoded = decodePortalAddress(portal);
    if (!decoded || decoded.errors.length > 0) {
      setError(decoded?.errors.join(" ") || t("stations.enter_a_12_glyph_portal_address"));
      return;
    }
    const canonicalPortal = portal.toUpperCase();
    const requestedOwnerId = canSeeAll ? stationOwnerId : pageMember.publicId;
    if (!requestedOwnerId) {
      setError(t("stations.select_the_station_owner"));
      return;
    }
    if (stations.some((station) =>
      station.portal === canonicalPortal &&
      station.galaxy === galaxy &&
      station.ownerId === requestedOwnerId &&
      !(editingStation &&
        station.portal === editingStation.portal &&
        station.galaxy === editingStation.galaxy &&
        station.ownerId === editingStation.ownerId),
    )) {
      setError(t("stations.this_portal_is_already_in_the_selected_owner_s_list"));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: editingStation ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingStation
          ? {
            currentPortal: editingStation.portal,
            currentGalaxy: editingStation.galaxy,
            currentOwnerId: editingStation.ownerId,
            portal: canonicalPortal,
            galaxy,
            ownerId: requestedOwnerId,
            name: stationName,
            note: stationNote,
          }
          : {
            portal: canonicalPortal,
            galaxy,
            ownerId: requestedOwnerId,
            name: stationName,
            note: stationNote,
          }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : t("errors.save_failed"));
      }
      setStations(parseStations(body.stations));
      setPortal("");
      setStationName("");
      setStationNote("");
      setPlanetType("");
      setStationNameEdited(false);
      setValidation({ valid: false, lookup: null });
      closeStationDialog();
      setNotice(editingStation
        ? t("stations.station_updated")
        : canSeeAll && requestedOwnerId !== pageMember.publicId
          ? t("stations.station_added_to_owner_s_archive", { owner: members.find((candidate) => candidate.publicId === requestedOwnerId)?.nmsName || members.find((candidate) => candidate.publicId === requestedOwnerId)?.name || t("common.not_specified") })
          : t("stations.portal_added_to_your_stations"));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeStation(stationPortal: string, stationGalaxy: number, ownerId: string, ownerName: string) {
    if (!window.confirm(t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", {
      portal: stationPortal,
      galaxy: galaxyLabel(stationGalaxy),
      owner: ownerName,
    }))) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: stationPortal, galaxy: stationGalaxy, ownerId }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : t("errors.deletion_failed"));
      }
      setStations(parseStations(body.stations));
      setNotice(t("stations.station_removed_from_the_owner_s_archive"));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.deletion_failed"));
    }
  }

  function missionSpecialtiesFor(station: StationEntry) {
    return canCreateMissions
      ? station.availableSpecialties
      : station.availableSpecialties.filter((specialty) => ["explorer_builder", "explorer", "builder"].includes(specialty));
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
      throw new Error(typeof message === "string" ? message : t("errors.save_failed"));
    }
    const created = body as Mission[];
    setNotice(created.length > 1
      ? t("stations.count_missions_created_from_the_station", { count: created.length })
      : t("stations.mission_created_from_station"));
    try {
      await refreshStations();
    } catch {
      setError(t("stations.mission_created_but_station_targets_could_not_be_updated"));
    }
  }

  return (
    <div className="app-shell">
      <AllianceSidebar activeSection="stazioni" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={loading ? sidebarStationCount : stations.length} offlineCount={sidebarOfflineCount} userCount={sidebarUserCount} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle={t("stations.stations")} settings={allianceSettings} />
        <MissionHero
          actionLabel={t("stations.add_station")}
          description={t(canSeeAll ? "admin.browse_alliance_registered_portals_and_their_planets" : "stations.register_portals_for_systems_you_have_discovered")}
          onCreate={openAddStation}
          settings={allianceSettings}
          showCreate
          title={t(canSeeAll ? "stations.space_stations" : "stations.my_stations")}
        />
        <main className="content-wrap stations-page">
          {(error || notice) && <p className={error ? "form-error" : "address-validation address-valid"}>{error ? <CircleAlert size={15} /> : null}{t(error || notice)}</p>}

          <section aria-label={t("stations.my_space_stations")} className="station-list-section">
            <div className="station-list-heading">
              <div aria-label={t("stations.filter_stations_by_mission_status")} className="member-filter-tabs station-filter-tabs" role="tablist">
                {(["all", "pending", "in_progress", "completed", ...(canSeeAll ? ["notes" as const] : [])] as StationFilter[]).filter((status) => status === "all" || status === stationFilter || stationCounts[status] > 0).map((status) => <button
                  aria-selected={stationFilter === status}
                  className={`member-filter-tab${stationFilter === status ? " selected" : ""}`}
                  key={status}
                  onClick={() => setStationFilter(status)}
                  role="tab"
                  type="button"
                >{t(status === "all" ? "stations.filter_all" : status === "pending" ? "common.pending_status_label" : status === "in_progress" ? "stations.filter_in_mission" : status === "completed" ? "stations.filter_mission_completed" : "stations.filter_with_notes")}<span>{stationCounts[status]}</span></button>)}
              </div>
              <div className="station-list-heading-tools">
                {canSeeAll && <button aria-label={t(showAllStations ? "stations.showing_all" : "stations.showing_mine")} aria-pressed={showAllStations} className={showAllStations ? "member-icon-action scope-toggle selected" : "member-icon-action scope-toggle"} data-tooltip={t(showAllStations ? "stations.showing_all" : "stations.showing_mine")} onClick={() => setShowAllStations((current) => !current)} type="button">{showAllStations ? <Eye size={15} /> : <EyeOff size={15} />}</button>}
                {!pageMember.simpleView && <label className="search-field station-search"><Search size={15} /><input aria-label={t("stations.search_stations_by_portal_owner_or_galaxy_or_notes")} onChange={(event) => setSearch(event.target.value)} placeholder={t("stations.search_portal_username_galaxy_or_notes")} value={search} /></label>}
                {!pageMember.simpleView && <div aria-label={t("stations.station_view")} className="view-toggle" role="group">
                  <button aria-label={t("navigation.list_view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("navigation.list_view")} type="button"><List size={15} /></button>
                  <button aria-label={t("navigation.card_view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("navigation.card_view")} type="button"><LayoutGrid size={15} /></button>
                </div>}
              </div>
            </div>
            {loading && <div className="station-list-empty station-list-loading"><LoadingSpinner /></div>}
            {!loading && visibleStations.length === 0 && <p className={`station-list-empty${stations.length === 0 ? " station-list-empty-no-saved" : ""}`}>{t(stations.length === 0 ? "stations.no_saved_portals" : "stations.no_stations_found")}</p>}
            {visibleStations.length > 0 && <ul className={`station-list ${viewMode === "cards" ? "station-list-cards" : ""}`}>{visibleStations.map((station) => {
              const planetImageUrl = cachedPlanetImageUrl(station.planet);
              const stationDisplayName = station.name || cachedPlanetType(station.planet) || cachedPlanetTitle(station.planet) || t("planet.unnamed_planet");
              const statusKey = planetSystemStatusKey(station.portal, station.galaxy);
              const canEditStation = canSeeAll ||
                (station.createdByMemberId ?? station.ownerId) === pageMember.publicId;
              const stationOwner = canSeeAll && <StationOwnerCell onOpenProfile={(memberId) => setProfileTarget({
                memberId,
                messageContext: {
                  type: "planet",
                  portal: station.portal,
                  galaxy: station.galaxy,
                  subjectLabel: station.name || cachedPlanetTitle(station.planet) || cachedPlanetType(station.planet),
                },
              })} ownerLabel={t("stations.station_owner")} station={station} />;
              return <li key={`${station.portal}:${station.galaxy}:${station.ownerId}`}>
                {viewMode === "cards" && <button className={`station-card-title${planetImageUrl ? " station-card-title-with-image" : ""}`} onClick={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} type="button">
                  {planetImageUrl && <Image alt="" className="station-card-planet-image" height={112} src={planetImageUrl} unoptimized width={112} />}
                  <span className="station-card-title-copy">
                    <span>{galaxyLabel(station.galaxy)}</span>
                    <strong>{stationDisplayName}</strong>
                    <StationSystemCoreInfo key={`${station.portal}:${station.galaxy}`} galaxy={station.galaxy} portal={station.portal} />
                  </span>
                </button>}
                {viewMode === "cards" && stationOwner && <div className="station-card-owner">{stationOwner}</div>}
                <div className="station-portal-code"><strong className="station-name">{stationDisplayName}</strong><GlyphStrip address={station.portal} /><code>{station.portal}</code>{viewMode === "list" && stationOwner}</div>
                <div className="station-planet-info-list">
                  {station.planet
                    ? <CachedPlanetInfo onOpen={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} planet={station.planet} />
                    : viewMode === "cards"
                      ? <p className="station-card-no-planet">{t("planet.no_almanac_data")}</p>
                      : <button className="station-planet-open station-planet-unknown" onClick={() => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })} type="button"><span>{galaxyLabel(station.galaxy)}</span><strong>{t("planet.no_almanac_data_open_details")}</strong></button>}
                </div>
                <div className="station-card-footer">
                  {canSeeAll && planetStatusesLoaded && <div className="station-system-status">
                    <strong>{t("system.system_status")}</strong>
                    <MissionSystemProgress
                      disabled={savingStatusKeys.includes(statusKey)}
                      editable
                      editableRoles={editableSystemStatusRoles(pageMember)}
                      onToggle={(status, checked) => void toggleStationSystemStatus(station.portal, station.galaxy, status, checked)}
                      statuses={planetStatuses[statusKey] ?? []}
                    />
                  </div>}
                  <div className="station-actions">
                  {(canCreateMissions || (isRanger && station.ownerId === pageMember.publicId)) && missionSpecialtiesFor(station).length > 0 && <button aria-label={t("stations.create_mission_from_portal", { portal: station.portal })} className="member-icon-action create-station-mission" data-tooltip={t("stations.create_mission_from_station")} onClick={() => setMissionStation({ portal: station.portal, galaxy: station.galaxy, title: cachedPlanetTitle(station.planet), ownerMemberId: station.ownerId })} type="button"><CirclePlus size={14} /></button>}
                  {station.hasMissions
                    ? canSeeAll
                      ? <Link aria-label={t("planet.open_missions_for_planet_portal", { portal: station.portal })} className="member-icon-action station-missions-link" data-tooltip={t("missions.open_associated_missions")} href={`/?search=${encodeURIComponent(station.portal)}`}><Crosshair size={14} /></Link>
                      : <span className="station-mission-lock">{t("missions.associated_mission")}</span>
                    : (canSeeAll || station.ownerId === pageMember.publicId) && <button aria-label={t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", { portal: station.portal, galaxy: galaxyLabel(station.galaxy), owner: stationOwnerName(station) })} className="member-icon-action delete-member" data-tooltip={t("stations.delete_station")} onClick={() => void removeStation(station.portal, station.galaxy, station.ownerId, stationOwnerName(station))} type="button"><Trash2 size={14} /></button>}
                  {canEditStation && <button aria-label={t("stations.edit_station_portal", { portal: station.portal })} className="member-icon-action" data-tooltip={t("stations.edit_station")} onClick={() => openEditStation(station)} type="button"><Pencil size={14} /></button>}
                  {station.note && <button aria-label={t("stations.view_notes_for_station", { station: stationDisplayName })} className="member-icon-action station-notes-action" data-tooltip={t("stations.view_station_notes")} onClick={() => setStationNoteView({ portal: station.portal, note: station.note ?? "" })} type="button"><FileText size={14} /></button>}
                  </div>
                </div>
              </li>;
            })}</ul>}
          </section>
        </main>
      </section>
      {addOpen && <div className="dialog-backdrop">
        <dialog aria-labelledby="station-dialog-title" aria-modal="true" className="mission-dialog station-dialog" open>
          <div className="dialog-heading">
            <div><h2 id="station-dialog-title">{t(editingStation ? "stations.edit_station" : "stations.add_station")}</h2></div>
              <button aria-label={t("common.close")} className="icon-button" onClick={closeStationDialog} type="button"><X size={18} /></button>
          </div>
          <form className="station-add-form" onSubmit={addStation}>
            <label className="field full-field station-name-field">
              <span>{t("stations.station_name")} <small>{t("common.editable_max_80_characters")}</small></span>
              <input
                aria-label={t("stations.station_name")}
                maxLength={80}
                onChange={(event) => {
                  setStationName(event.target.value);
                  setStationNameEdited(true);
                }}
                placeholder={planetType || t("planet.e_g_large_irradiated_planet")}
                value={stationName}
              />
            </label>
            <label className="field full-field">
              <span>{t("stations.station_notes")} <small>{t("stations.optional_max_1000_characters")}</small></span>
              <textarea
                aria-label={t("stations.station_notes")}
                maxLength={1000}
                onChange={(event) => setStationNote(event.target.value)}
                rows={3}
                value={stationNote}
              />
            </label>
            {!editingStation?.hasMissions && <SystemAddressField address={portal} galaxy={galaxy} onChange={(value) => {
              setPortal(value);
              setStationName("");
              setPlanetType("");
              setStationNameEdited(false);
              setError("");
              setValidation({ valid: false, lookup: null });
            }} onLookupResolved={handleStationLookup} onStateChange={setValidation} />}
            {!editingStation?.hasMissions && <label className="field station-galaxy-select">
              <span>{t("stations.galaxy")}</span>
              <select onChange={(event) => {
                setGalaxy(Number(event.target.value));
                setStationName("");
                setPlanetType("");
                setStationNameEdited(false);
                setValidation({ valid: false, lookup: null });
              }} value={galaxy}>
                {galaxyNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </label>}
            {canSeeAll && <label className="field">
              <span>{t("stations.station_owner")}</span>
              <select onChange={(event) => setStationOwnerId(event.target.value)} required value={stationOwnerId}>
                {[pageMember, ...members.filter((candidate) => candidate.publicId !== pageMember.publicId)]
                  .map((candidate) => (
                    <option key={candidate.publicId} value={candidate.publicId}>
                      {candidate.nmsName || candidate.name}
                    </option>
                  ))}
              </select>
            </label>}
            {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
            <div className="dialog-actions">
              <span className="action-spacer" />
              <button className="quiet-button" onClick={closeStationDialog} type="button">{t("common.cancel")}</button>
              <button className="primary-button" disabled={saving || (!editingStation?.hasMissions && !validation.valid)} type="submit">{saving ? t("common.saving") : t(editingStation ? "common.save" : "common.add")}{editingStation ? <Pencil size={15} /> : <Plus size={15} />}</button>
            </div>
          </form>
        </dialog>
      </div>}
      {selectedStation && <PlanetCard
        contextLabel={galaxyLabel(selectedStation.galaxy)}
        galaxy={selectedStation.galaxy}
        key={`${selectedStation.portal}:${selectedStation.galaxy}`}
        onClose={() => setSelectedStation(null)}
        portal={selectedStation.portal}
        title={t("stations.space_station")}
      />}
      {profileTarget && <MemberCardDialog memberId={profileTarget.memberId} messageContext={profileTarget.messageContext} onClose={() => setProfileTarget(null)} />}
      {stationNoteView && <div className="dialog-backdrop">
        <dialog aria-labelledby="station-notes-title" aria-modal="true" className="mission-dialog station-notes-dialog" open>
          <div className="dialog-heading">
            <div><span className="eyebrow">{stationNoteView.portal}</span><h2 id="station-notes-title">{t("stations.station_notes")}</h2></div>
            <button aria-label={t("common.close")} className="icon-button" onClick={() => setStationNoteView(null)} type="button"><X size={18} /></button>
          </div>
          <p className="station-notes-content">{stationNoteView.note}</p>
        </dialog>
      </div>}
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} />}
      {missionStation && <MissionForm
        availableSpecialties={missionStationRow ? missionSpecialtiesFor(missionStationRow) : undefined}
        hideAddress
        simplified={!canCreateMissions || pageMember.simpleView === true}
        simplifiedStatusRole={pageMember.specialty || "ranger"}
        initialValues={{
          title: missionStation.title,
          systemAddress: missionStation.portal,
          galaxy: missionStation.galaxy,
          stationOwnerMemberId: missionStation.ownerMemberId,
          targetSpecialty: (missionStationRow ? (missionSpecialtiesFor(missionStationRow).includes("explorer") ? "explorer" : missionSpecialtiesFor(missionStationRow)[0]) : undefined) ?? "builder",
        }}
        members={members}
        mission={null}
        onClose={() => setMissionStation(null)}
        onDelete={async () => undefined}
        onSave={(input) => createMissionFromStation({ ...input, stationOwnerMemberId: missionStation.ownerMemberId })}
        stationOwners={stations.map((station) => ({
          portal: station.portal,
          galaxy: station.galaxy,
          ownerId: station.ownerId,
          ownerName: stationOwnerName(station),
        }))}
      />}
    </div>
  );
}