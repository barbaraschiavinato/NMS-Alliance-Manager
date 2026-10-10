"use client";

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { CircleAlert, Orbit, Pencil, Plus, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { SystemAddressField, type SystemAddressValidation } from "@/components/shared/portal-address-field";
import { MissionForm } from "@/components/modals/mission-form";
import { PlanetCard } from "@/components/modals/planet-card";
import { MemberCardDialog, type MemberMessageContext } from "@/components/modals/member-card-dialog";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { decodePortalAddress, portalSearchMatches, type Mission, type MissionInput } from "@/lib/missions";
import { isMissionSystemStatus, planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";
import { useNavigationSearchState } from "@/components/shared/navigation-search-reset";
import { sortByCreatedAtDescending } from "@/lib/created-at";
import { generateSystemName } from "@/lib/system-name";
import { asRecord, cachedPlanetTitle, cachedPlanetType, parsePlanetSystemStatuses, parseStations, stationOwnerName, type StationEntry, type StationFilter, type StationMissionSeed } from "@/components/cards/station-card/parts";
import { StationList } from "@/components/sections/station-list";

export function StationsPage({ currentMember, alliance, missionCount, initialSearch = "", initialCreateStation = null, initialStation = null, sidebarOfflineCount, sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  initialSearch?: string;
  initialCreateStation?: Readonly<{ portal: string; galaxy: number; ownerId: string }> | null;
  initialStation?: Readonly<{ portal: string; galaxy: number; ownerId: string }> | null;
  sidebarStationCount: number;
  sidebarOfflineCount?: number;
  sidebarUserCount?: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [renderedAt] = useState(() => Date.now());
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
  const [portal, setPortal] = useState(initialCreateStation?.portal ?? "");
  const [galaxy, setGalaxy] = useState(initialCreateStation?.galaxy ?? 0);
  const [stationOwnerId, setStationOwnerId] = useState(initialCreateStation?.ownerId ?? currentMember.publicId);
  const [stationName, setStationName] = useState("");
  const [stationNote, setStationNote] = useState("");
  const [planetType, setPlanetType] = useState("");
  const [stationNameEdited, setStationNameEditedState] = useState(false);
  const stationNameEditedRef = useRef(false);
  const [generatingNames, setGeneratingNames] = useState(initialCreateStation ? 1 : 0);
  function setStationNameEdited(edited: boolean) {
    stationNameEditedRef.current = edited;
    setStationNameEditedState(edited);
  }
  const [creatingFromMission, setCreatingFromMission] = useState(Boolean(initialCreateStation));
  const [validation, setValidation] = useState<SystemAddressValidation>(
    initialCreateStation ? { valid: true, lookup: null } : { valid: false, lookup: null },
  );
  const [addOpen, setAddOpen] = useState(Boolean(initialCreateStation));
  const [editingStation, setEditingStation] = useState<StationEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingStations, setExportingStations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useNavigationSearchState(initialSearch);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canSeeAll = pageMember.role === "moderator" || pageMember.role === "admin";
  const canCreateMissions = canSeeAll;
  const canCreateOwnSpecialtyMission = !canSeeAll &&
    (pageMember.specialty === "explorer" || pageMember.specialty === "builder");
  const canChooseStationView = canSeeAll || pageMember.displayRole === "moderator" ||
    pageMember.specialty === "explorer" || pageMember.specialty === "builder" || pageMember.specialty === "ranger";
  const missionStationRow = missionStation
    ? stations.find((station) => station.portal === missionStation.portal && station.galaxy === missionStation.galaxy)
    : undefined;
  const [activeStationTab, setActiveStationTab] = useState<"all" | "mine">("all");
  const stationCandidates = useMemo(() => stations.filter((station) =>
    (!initialStation || (
      station.portal === initialStation.portal &&
      station.galaxy === initialStation.galaxy &&
      station.ownerId === initialStation.ownerId
    )) &&
    (`${station.name ?? cachedPlanetType(station.planet)} ${station.note ?? ""} ${station.portal} ${station.ownerNmsName ?? ""} ${station.ownerName ?? ""} ${galaxyLabel(station.galaxy)}`.toLowerCase().includes(search.toLowerCase()) ||
      portalSearchMatches(station.portal, search)),
  ), [initialStation, search, stations]);
  const searchableStations = stationCandidates;
  const stationCounts: Record<StationFilter, number> = {
    all: searchableStations.length,
    pending: searchableStations.filter((station) => station.missionStatus === "none").length,
    in_progress: searchableStations.filter((station) => station.missionStatus === "in_progress").length,
    completed: searchableStations.filter((station) => station.missionStatus === "completed").length,
    notes: searchableStations.filter((station) => Boolean(station.note?.trim())).length,
  };
  const visibleStationFilters = (["all", "pending", "in_progress", "completed", ...(canSeeAll ? ["notes" as const] : [])] as StationFilter[])
    .filter((status) => status === "all" || status === stationFilter || stationCounts[status] > 0);
  const statusFilteredStations = stationFilter === "all"
    ? searchableStations
    : stationFilter === "notes"
      ? canSeeAll ? searchableStations.filter((station) => Boolean(station.note?.trim())) : searchableStations
      : searchableStations.filter((station) => station.missionStatus === (stationFilter === "pending" ? "none" : stationFilter));
  const ownDiscoveredStations = stationCandidates.filter((station) => station.ownerId === pageMember.publicId);
  const visibleStations = sortByCreatedAtDescending(activeStationTab === "mine" ? ownDiscoveredStations : statusFilteredStations);

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

  async function exportStations() {
    setExportingStations(true);
    setError("");
    try {
      const response = await fetch("/api/stations/export", { cache: "no-store" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? t(message) : t("stations.error_unable_to_export_stations"));
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `stazioni-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("stations.error_unable_to_export_stations"));
    } finally {
      setExportingStations(false);
    }
  }

  function openAddStation() {
    setCreatingFromMission(false);
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
    setCreatingFromMission(false);
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
    if (!initialCreateStation) return;
    window.history.replaceState(null, "", "/stations");
    void generateSystemName(initialCreateStation.portal, initialCreateStation.galaxy).then((systemName) => {
      if (systemName) setStationName((current) => stationNameEditedRef.current || current ? current : `${systemName} System`);
    }).finally(() => setGeneratingNames((count) => count - 1));
  }, [initialCreateStation]);

  useEffect(() => {
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
  }, [t]);

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

  async function fillSystemName(address: string, lookupGalaxy: number) {
    setGeneratingNames((count) => count + 1);
    try {
      const systemName = await generateSystemName(address, lookupGalaxy);
      if (systemName) setStationName((current) => stationNameEditedRef.current ? current : `${systemName} System`);
    } finally {
      setGeneratingNames((count) => count - 1);
    }
  }

  function handleStationLookup(lookup: NonNullable<SystemAddressValidation["lookup"]>) {
    const nextPlanetType = lookup.planetType?.trim() ?? "";
    setPlanetType(nextPlanetType);
    if (!stationNameEdited) setStationName(nextPlanetType);
    void fillSystemName(lookup.address, lookup.galaxy);
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
    if (canCreateMissions) return station.availableSpecialties;
    if (canCreateOwnSpecialtyMission) {
      return station.availableSpecialties.filter((specialty) => specialty === pageMember.specialty);
    }
    return station.availableSpecialties.filter((specialty) => ["explorer_builder", "explorer", "builder"].includes(specialty));
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
      <Sidebar activeSection="stazioni" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={loading ? sidebarStationCount : stations.length} offlineCount={sidebarOfflineCount} userCount={sidebarUserCount} />
      <section className="main-panel">
        <Header currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle={t("stations.stations")} settings={allianceSettings} />
        <Hero
          subtitle={t(canSeeAll || canCreateOwnSpecialtyMission ? "admin.browse_alliance_registered_portals_and_their_planets" : "stations.register_portals_for_systems_you_have_discovered")}
          settings={allianceSettings}
          title={t(canSeeAll || canCreateOwnSpecialtyMission ? "stations.space_stations" : "stations.my_stations")}
        >
          <HeroAddButton label={t("stations.add_station")} onClick={openAddStation} />
        </Hero>
        <main className="content-wrap stations-page">
          {(error || notice) && <p className={error ? "form-error" : "address-validation address-valid"}>{error ? <CircleAlert size={15} /> : null}{t(error || notice)}</p>}

<StationList
          activeStationTab={activeStationTab}
          canChooseStationView={canChooseStationView}
          canCreateMissions={canCreateMissions}
          canSeeAll={canSeeAll}
          exportingStations={exportingStations}
          loading={loading}
          member={pageMember}
          onCreateMission={(station) => setMissionStation({ portal: station.portal, galaxy: station.galaxy, title: station.name || cachedPlanetTitle(station.planet), ownerMemberId: station.ownerId })}
          onEdit={openEditStation}
          onExport={() => void exportStations()}
          onFilterChange={setStationFilter}
          onOpenProfile={setProfileTarget}
          onOpenStation={(station) => setSelectedStation({ portal: station.portal, galaxy: station.galaxy })}
          onRemove={(station) => void removeStation(station.portal, station.galaxy, station.ownerId, stationOwnerName(station))}
          onSearchChange={setSearch}
          onTabChange={setActiveStationTab}
          onToggleStatus={(station, status, checked) => void toggleStationSystemStatus(station.portal, station.galaxy, status, checked)}
          onViewNote={(station) => setStationNoteView({ portal: station.portal, note: station.note ?? "" })}
          ownStationCount={ownDiscoveredStations.length}
          planetStatuses={planetStatuses}
          planetStatusesLoaded={planetStatusesLoaded}
          renderedAt={renderedAt}
          savingStatusKeys={savingStatusKeys}
          search={search}
          stationCounts={stationCounts}
          stationFilter={stationFilter}
          stations={stations}
          visibleStationFilters={visibleStationFilters}
          visibleStations={visibleStations}
        />
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
                placeholder={planetType || t("stations.station_name_example", { alliance: allianceSettings.name })}
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
            {!creatingFromMission && !editingStation?.hasMissions && <SystemAddressField address={portal} galaxy={galaxy} onChange={(value) => {
              setPortal(value);
              setStationName("");
              setPlanetType("");
              setStationNameEdited(false);
              setError("");
              setValidation({ valid: false, lookup: null });
            }} onLookupResolved={handleStationLookup} onStateChange={setValidation} />}
            {!creatingFromMission && !editingStation?.hasMissions && <label className="field station-galaxy-select">
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
              <button className="primary-button" disabled={saving || generatingNames > 0 || (!editingStation && validation.valid && !validation.lookup) || (!editingStation?.hasMissions && !validation.valid)} type="submit">{saving ? t("common.saving") : t(editingStation ? "common.save" : "common.add")}{generatingNames > 0 || (!editingStation && validation.valid && !validation.lookup) ? <Orbit aria-hidden="true" className="button-spinner" size={15} /> : editingStation ? <Pencil size={15} /> : <Plus size={15} />}</button>
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
        hideSpecialty={canCreateOwnSpecialtyMission}
        hideSystemStatus={canCreateOwnSpecialtyMission}
        simplified={!canCreateMissions || pageMember.simpleView === true}
        simplifiedStatusRole={pageMember.specialty || "ranger"}
        initialValues={{
          title: missionStation.title,
          systemAddress: missionStation.portal,
          galaxy: missionStation.galaxy,
          stationOwnerMemberId: missionStation.ownerMemberId,
          targetSpecialty: (() => {
            const available = missionStationRow ? missionSpecialtiesFor(missionStationRow) : [];
            if (pageMember.specialty && available.includes(pageMember.specialty)) return pageMember.specialty;
            return available.includes("explorer") ? "explorer" : available[0] ?? "builder";
          })(),
          ...(canCreateOwnSpecialtyMission ? {
            assignedMemberId: pageMember.publicId,
            assignedTo: pageMember.nmsName || pageMember.name,
          } : {}),
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