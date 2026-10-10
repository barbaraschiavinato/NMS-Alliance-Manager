import { AlertTriangle, Check, CirclePlus, Compass, Eye, EyeOff, FileText, Hammer, Info, LayoutGrid, List, Orbit, Pencil, Search, ShieldPlus, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Mission, MissionSpecialty, MissionStatus } from "@/lib/missions";
import { GlyphStrip } from "@/components/portal-address-field";
import type { AllianceMember } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";
import { planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useEffect, useRef, useState } from "react";
import { MemberCardDialog, type MemberMessageContext } from "@/components/member-card-dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useLocale } from "@/components/locale-provider";
import { StationSystemCoreInfo } from "@/components/station-system-core-info";
import { editableSystemStatusRoles } from "@/lib/planet-system-status";
import { MissionSystemProgress } from "@/components/mission-system-progress";
import type { StationOwnerOption } from "@/components/mission-form";

export type MissionFilter = "all" | MissionStatus | "pending_assigned" | "pending_unassigned";
type MissionCounts = Record<MissionFilter, number>;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isMissionAssignee(mission: Mission, member: AllianceMember): boolean {
  return Boolean(mission.assignedMemberId && mission.assignedMemberId === member.publicId);
}

const targetSpecialtyNames: Record<MissionSpecialty, string> = {
  all: "common.all",
  explorer_builder: "common.explorers_and_builders",
  builder: "common.builders",
  ranger: "common.ranger",
  explorer: "common.explorers",
  other: "common.other",
};

const missionFilterLabels: Record<MissionFilter, string> = {
  all: "common.all",
  in_progress: "missions.status_in_progress",
  pending: "missions.status_pending",
  pending_assigned: "missions.pending_assigned",
  pending_unassigned: "missions.pending_unassigned",
  completed: "missions.status_completed",
};

const requestTooltipKeys = {
  ranger: "missions.create_ranger_mission",
  explorer: "missions.create_explorer_mission",
  builder: "missions.create_builder_mission",
  all: "missions.create_ranger_mission",
  other: "missions.create_ranger_mission",
  explorer_builder: "missions.create_ranger_mission",
} as const;

function MissionRowAction({ mission, currentMember, canManage, requestedSpecialty = null, onCreateRanger, onEdit, onDeleteMission, onClaim, onComplete, onReopen }: Readonly<{
  mission: Mission;
  currentMember: AllianceMember;
  canManage: boolean;
  requestedSpecialty?: MissionSpecialty | null;
  onCreateRanger?: (mission: Mission) => void;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  onReopen: (mission: Mission) => void;
}>) {
  const { t } = useLocale();
  if (mission.status === "completed" && (currentMember.simpleView === true || !canManage)) {
    if (mission.assignedMemberId === currentMember.publicId) {
      return <button className="claim-button claim-button-reopen mission-action-button" onClick={() => onReopen(mission)} type="button">{t("missions.reopen_mission")}</button>;
    }
    return <span className="no-row-action">—</span>;
  }
  if (canManage) {
    return <span className="mission-row-actions">
      {requestedSpecialty && onCreateRanger && <button aria-label={t(requestTooltipKeys[requestedSpecialty])} className={`row-action row-action-${requestedSpecialty}`} data-tooltip={t(requestTooltipKeys[requestedSpecialty])} onClick={() => onCreateRanger(mission)} type="button">{requestedSpecialty === "builder" ? <Hammer size={15} /> : requestedSpecialty === "ranger" ? <Compass size={15} /> : requestedSpecialty === "explorer" ? <Search size={15} /> : <ShieldPlus size={15} />}</button>}
      <button aria-label={`${t("common.edit")} ${mission.title}`} className="row-action" data-tooltip={t("missions.edit_mission")} onClick={() => onEdit(mission)} type="button"><Pencil size={15} /></button>
      <button aria-label={`${t("common.delete")} ${mission.title}`} className="row-action row-action-delete" data-tooltip={t("missions.delete_mission")} onClick={() => onDeleteMission(mission)} type="button"><Trash2 size={15} /></button>
    </span>;
  }
  if (mission.assignedMemberId === currentMember.publicId && mission.status !== "completed") {
    return <button className="claim-button mission-action-button" onClick={() => onComplete(mission)} type="button">{t("missions.complete_mission")}</button>;
  }
  if (!mission.assignedMemberId && !mission.assignedTo.trim()) {
    return <button className="claim-button claim-button-take mission-action-button" onClick={() => onClaim(mission)} type="button">{t("missions.claim")}</button>;
  }
  return <span className="no-row-action">—</span>;
}

function MissionStationLink({ mission, canManage, stationOwners, stationOwnersLoaded }: Readonly<{
  mission: Mission;
  canManage: boolean;
  stationOwners: StationOwnerOption[];
  stationOwnersLoaded: boolean;
}>) {
  const { t } = useLocale();
  const stationExists = stationOwners.some((station) =>
    station.portal === mission.systemAddress.toUpperCase() &&
    station.galaxy === mission.galaxy,
  );
  if (!canManage || !stationOwnersLoaded) return null;
  if (stationExists) {
    const params = new URLSearchParams({ search: mission.systemAddress });
    const label = t("missions.open_linked_station");
    return <Link
      aria-label={label}
      className="member-icon-action mission-station-link member-station-filter"
      data-tooltip={label}
      href={`/stations?${params.toString()}`}
      title={label}
    ><Orbit size={14} /></Link>;
  }
  const params = new URLSearchParams({
    createStation: "1",
    portal: mission.systemAddress.toUpperCase(),
    galaxy: String(mission.galaxy),
  });
  if (mission.stationOwnerMemberId) params.set("ownerId", mission.stationOwnerMemberId);
  const label = t("stations.create_station_from_mission");
  return <Link
    aria-label={label}
    className="member-icon-action member-station-filter mission-create-station"
    data-tooltip={label}
    href={`/stations?${params.toString()}`}
    title={label}
  ><CirclePlus size={15} /></Link>;
}

function AssigneeCell({ mission, members, currentMember, onOpenProfile }: Readonly<{
  mission: Mission;
  members: AllianceMember[];
  currentMember: AllianceMember;
  onOpenProfile: (memberId: string, context: MemberMessageContext) => void;
}>) {
  const { t } = useLocale();
  const assignedMember = members.find((member) => member.publicId === mission.assignedMemberId)
    ?? (mission.assignedMemberId === currentMember.publicId ? currentMember : undefined);
  const image = assignedMember?.image;
  const name = mission.assignedTo || t("missions.not_assigned");
  const memberId = mission.assignedMemberId || assignedMember?.publicId;

  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={mission.assignedTo || "—"} />
    <span className="assignee-name">{name}</span>
  </>;
  return memberId
    ? <button aria-label={name} className="assignee-cell mission-member-link" data-tooltip={name} onClick={() => onOpenProfile(memberId, { type: "mission", missionCode: mission.id, subjectLabel: mission.title })} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
}

function DiscovererCell({ memberId, name, image, portal, galaxy, onOpenProfile }: Readonly<{
  memberId?: string;
  name?: string;
  image?: string;
  portal: string;
  galaxy: number;
  onOpenProfile: (memberId: string, context: MemberMessageContext) => void;
}>) {
  const { t } = useLocale();
  const label = name || t("common.not_specified");
  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={label} />
    <span className="assignee-name">{label}</span>
  </>;

  return memberId
    ? <button aria-label={label} className="assignee-cell mission-member-link" data-tooltip={label} onClick={() => onOpenProfile(memberId, { type: "planet", portal, galaxy, subjectLabel: "" })} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
}

function MissionProgress({ mission, editable, onChange }: Readonly<{
  mission: Mission;
  editable: boolean;
  onChange: (mission: Mission, progress: number) => Promise<void>;
}>) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<{ source: number; value: number } | null>(null);
  const progress = draft?.source === mission.progress ? draft.value : mission.progress;
  const committedProgress = useRef(mission.progress);

  useEffect(() => {
    committedProgress.current = mission.progress;
  }, [mission.progress]);

  function commitProgress(value: number) {
    setDraft({ source: mission.progress, value });
    if (value === committedProgress.current) return;
    committedProgress.current = value;
    void onChange(mission, value).catch(() => {
      committedProgress.current = mission.progress;
      setDraft(null);
    });
  }

  if (mission.targetSpecialty !== "ranger" && mission.targetSpecialty !== "explorer" && mission.targetSpecialty !== "builder") return null;

  return <div className={`progress-cell progress-cell-${mission.targetSpecialty}${editable ? " progress-cell-editable" : ""}`}>
    {editable
      ? <input
        aria-label={t("missions.progress_for_mission", { title: mission.title })}
        max={100}
        min={0}
        onBlur={(event) => commitProgress(Number(event.currentTarget.value))}
        onChange={(event) => setDraft({ source: mission.progress, value: Number(event.target.value) })}
        onKeyUp={(event) => commitProgress(Number(event.currentTarget.value))}
        onPointerUp={(event) => commitProgress(Number(event.currentTarget.value))}
        type="range"
        value={progress}
      />
      : <div aria-hidden="true" className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div>}
    <span>{progress}%</span>
  </div>;
}

function MissionNotesButton({ mission, onView }: Readonly<{
  mission: Mission;
  onView: (mission: Mission) => void;
}>) {
  const { t } = useLocale();
  if (!mission.notes?.trim()) return null;
  return <button
    aria-label={t("missions.view_notes_for_mission", { title: mission.title })}
    className="mission-notes-button"
    data-tooltip={t("missions.view_mission_notes")}
    onClick={() => onView(mission)}
    type="button"
  ><FileText size={14} /></button>;
}

type PlanetNotes = Readonly<{ title: string; portal: string; notes: string[] }>;
const planetNotesRequests = new Map<string, Promise<string[]>>();

function readPlanetNotes(mission: Mission): Promise<string[]> {
  const key = mission.id;
  const cachedRequest = planetNotesRequests.get(key);
  if (cachedRequest) return cachedRequest;

  const request = fetch(`/api/missions/${encodeURIComponent(mission.id)}/planet-notes`, {
    cache: "no-store",
  }).then(async (response) => {
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : "Unable to read planet notes.");
    }
    const note = asRecord(body)?.note;
    return typeof note === "string" && note.trim() ? [note.trim()] : [];
  }).then((notes) => {
    if (planetNotesRequests.get(key) === request) planetNotesRequests.delete(key);
    return notes;
  }).catch((error: unknown) => {
    if (planetNotesRequests.get(key) === request) planetNotesRequests.delete(key);
    throw error;
  });
  planetNotesRequests.set(key, request);
  return request;
}

function PlanetNotesButton({ mission, onView }: Readonly<{
  mission: Mission;
  onView: (notes: PlanetNotes) => void;
}>) {
  const { t } = useLocale();
  const [hasNotes, setHasNotes] = useState(false);

  useEffect(() => {
    let active = true;
    readPlanetNotes(mission)
      .then((notes) => {
        if (active) setHasNotes(notes.length > 0);
      })
      .catch((error: unknown) => {
        if (active) console.error("Unable to load planet notes", error);
      });
    return () => {
      active = false;
    };
  }, [mission]);

  if (!hasNotes) return null;
  return <button
    aria-label={t("planet.view_notes_for_planet", { title: mission.title })}
    className="planet-notes-button"
    data-tooltip={t("planet.view_planet_notes")}
    onClick={() => void readPlanetNotes(mission)
      .then((notes) => onView({ title: mission.title, portal: mission.systemAddress, notes }))
      .catch((error: unknown) => console.error("Unable to open planet notes", error))}
    type="button"
  ><Info size={14} /></button>;
}

function MemberAvatar({ image, label }: Readonly<{ image?: string; label: string }>) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = label.slice(0, 2).toUpperCase() || "—";

  return <span aria-hidden="true" className={`assignee-avatar ${image && !imageFailed ? "assignee-avatar-image" : ""}`}>
    {image && !imageFailed
      ? <Image alt="" height={21} onError={() => setImageFailed(true)} src={image} unoptimized width={21} />
      : initials}
  </span>;
}

function MissionPlanetThumbnail({ mission }: Readonly<{ mission: Mission }>) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const address = mission.systemAddress ?? "";
  const validPortalAddress = /^[0-9a-f]{12}$/i.test(address);

  useEffect(() => {
    if (!validPortalAddress || !Number.isInteger(mission.galaxy) || mission.galaxy < 0 || mission.galaxy > 255) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ address, galaxy: String(mission.galaxy) });

    fetch(`/api/missions/planet?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          if (response.status !== 404) throw new Error("Unable to load planet image.");
          return;
        }
        const planet = asRecord(asRecord(body)?.planet);
        const pictures = asRecord(planet?.pictures);
        const disc = pictures?.disc;
        if (typeof disc === "string" && disc.startsWith("/planets/")) {
          setImageUrl(`https://nmsalmanac.com/api${disc}`);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Unable to load mission planet thumbnail", error);
      });

    return () => controller.abort();
  }, [address, mission.galaxy, validPortalAddress]);

  const completed = mission.status === "completed";
  if (imageUrl && !imageFailed) {
    return <span aria-hidden="true" className={`mission-card-planet-thumb${completed ? " mission-card-planet-thumb-done" : ""}`}>
      <Image alt="" height={56} onError={() => setImageFailed(true)} src={imageUrl} unoptimized width={56} />
    </span>;
  }

  return <span aria-hidden="true" className={`mission-card-planet-thumb mission-card-planet-fallback${completed ? " mission-card-planet-thumb-done" : ""}`}>
    {completed ? <Check size={15} /> : <Compass size={15} />}
  </span>;
}

function NewMissionRibbon({ mission }: Readonly<{ mission: Mission }>) {
  const { t } = useLocale();
  if (mission.status === "completed") return <span className="station-new-ribbon-clip"><span className="station-new-ribbon station-completed-ribbon">{t("missions.status_completed")}</span></span>;
  if (!mission.assignedMemberId?.trim() && !mission.assignedTo.trim()) return <span className="station-new-ribbon-clip"><span className="station-new-ribbon station-available-ribbon">{t("missions.available_ribbon")}</span></span>;
  return null;
}

function MissionCard({ onReopen, mission, systemStatuses, currentMember, canManage, stationOwners, stationOwnersLoaded, requestedSpecialty, onCreateRangerMission, members, onEdit, onDeleteMission, onOpenPlanet, onClaim, onComplete, onToggleSystemStatus, onUpdateProgress, onViewNotes, onViewPlanetNotes, onOpenProfile, getDiscovererImage }: Readonly<{
  mission: Mission;
  systemStatuses: PlanetSystemStatuses;
  currentMember: AllianceMember;
  canManage: boolean;
  stationOwners: StationOwnerOption[];
  stationOwnersLoaded: boolean;
  requestedSpecialty: (mission: Mission) => MissionSpecialty | null;
  onCreateRangerMission: (mission: Mission) => void;
  members: AllianceMember[];
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  onReopen: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  onUpdateProgress: (mission: Mission, progress: number) => Promise<void>;
  onViewNotes: (mission: Mission) => void;
  onViewPlanetNotes: (notes: PlanetNotes) => void;
  onOpenProfile: (memberId: string, context: MemberMessageContext) => void;
  getDiscovererImage: (memberId?: string) => string | undefined;
}>) {
  const { t, systemLabel } = useLocale();
  const statuses = systemStatuses[planetSystemStatusKey(mission.systemAddress, mission.galaxy)] ?? [];
  const locked = mission.status === "completed" && (currentMember.simpleView === true || !canManage);
  const canUpdateSystemStatus = mission.assignedMemberId === currentMember.publicId && !locked;
  const canUpdateProgress = !canManage && canUpdateSystemStatus;
  const canViewNotes = canManage || isMissionAssignee(mission, currentMember);
  return <article className="mission-card mission-card-ribbon">
    <NewMissionRibbon mission={mission} />
    <div className="mission-card-heading">
      <div className="mission-name-cell">
        <MissionPlanetThumbnail mission={mission} />
        <div>
          <span className={`mission-galaxy${(mission.galaxy ?? 0) !== 0 ? " mission-galaxy-alert" : ""}`} data-tooltip={(mission.galaxy ?? 0) !== 0 ? t("missions.galaxy_portals_warning") : undefined} tabIndex={(mission.galaxy ?? 0) !== 0 ? 0 : undefined}>{(mission.galaxy ?? 0) !== 0 && <AlertTriangle size={9} />}{galaxyLabel(mission.galaxy ?? 0)}</span>
          <div className="mission-title-with-info">
            <button aria-label={`${t("planet.open_planet_details_for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} type="button">{mission.title}</button>
            <PlanetNotesButton mission={mission} onView={onViewPlanetNotes} />
          </div>
          {mission.description && <span className="mission-description">{mission.description}</span>}
        </div>
      </div>
      <span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span>
    </div>
    <div className="mission-card-system">
      <GlyphStrip address={mission.systemAddress ?? ""} />
      <span className="mission-card-system-text">{systemLabel(mission) || t("system.system_label")}</span>
      <StationSystemCoreInfo key={`${mission.systemAddress}:${mission.galaxy}`} galaxy={mission.galaxy ?? 0} portal={mission.systemAddress ?? ""} />
    </div>
    <div className="mission-card-people">
      <div><small>{t("missions.discoverer_column_heading")}</small><DiscovererCell memberId={mission.stationOwnerMemberId} galaxy={mission.galaxy} image={getDiscovererImage(mission.stationOwnerMemberId)} name={mission.stationOwnerName} onOpenProfile={onOpenProfile} portal={mission.systemAddress} /></div>
      <div><small>{t("missions.assignee_column_heading")}</small><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={onOpenProfile} /></div>
    </div>
    <div className="mission-card-progress">
      <span className={`badge badge--priority badge--priority-${mission.priority}`}><span />{t(`common.${mission.priority}`)}</span>
      <MissionProgress editable={canUpdateProgress} mission={mission} onChange={onUpdateProgress} />
    </div>
    <div className="mission-card-actions">
      <MissionSystemProgress editable={canUpdateSystemStatus} editableRoles={editableSystemStatusRoles(currentMember)} onToggle={(status, checked) => onToggleSystemStatus(mission, status, checked)} statuses={statuses} />
      <div className="mission-card-action-buttons">
        <MissionStationLink canManage={canManage} mission={mission} stationOwners={stationOwners} stationOwnersLoaded={stationOwnersLoaded} />
        <MissionRowAction requestedSpecialty={requestedSpecialty(mission)} canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onReopen={onReopen} onCreateRanger={onCreateRangerMission} onDeleteMission={onDeleteMission} onEdit={onEdit} />
        {canViewNotes && <MissionNotesButton mission={mission} onView={onViewNotes} />}
      </div>
    </div>
  </article>;
}

export function MissionTable({
  missions,
  counts,
  filter,
  search,
  searchInput,
  onFilterChange,
  onSearchChange,
  onScopeChange,
  showAll = true,
  onEdit,
  onDeleteMission,
  onOpenPlanet,
  onClaim,
  onComplete,
  onReopen,
  requestedSpecialty,
  onCreateRangerMission,
  onToggleSystemStatus,
  onUpdateProgress,
  currentMember,
  canManage,
  stationOwners,
  stationOwnersLoaded,
  members,
  defaultView,
  planetStatuses,
  loading = false,
}: Readonly<{
  missions: Mission[];
  counts: MissionCounts;
  filter: MissionFilter;
  search: string;
  searchInput: React.RefObject<HTMLInputElement | null>;
  onFilterChange: (filter: MissionFilter) => void;
  onSearchChange: (search: string) => void;
  onScopeChange?: (showAll: boolean) => void;
  showAll?: boolean;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  onReopen: (mission: Mission) => void;
  requestedSpecialty: (mission: Mission) => MissionSpecialty | null;
  onCreateRangerMission: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  onUpdateProgress: (mission: Mission, progress: number) => Promise<void>;
  currentMember: AllianceMember;
  canManage: boolean;
  stationOwners: StationOwnerOption[];
  stationOwnersLoaded: boolean;
  members: AllianceMember[];
  defaultView: "list" | "cards";
  planetStatuses: PlanetSystemStatuses;
  loading?: boolean;
}>) {
  const { t, systemLabel } = useLocale();
  const [profileTarget, setProfileTarget] = useState<{ memberId: string; messageContext: MemberMessageContext } | null>(null);
  const [missionNoteView, setMissionNoteView] = useState<Mission | null>(null);
  const [planetNoteView, setPlanetNoteView] = useState<PlanetNotes | null>(null);
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const simpleView = currentMember.simpleView === true;
  const viewMode = simpleView ? "cards" : viewOverride ?? defaultView;
  const [discovererImages, setDiscovererImages] = useState<Record<string, string>>({});
  const discovererIdKey = [...new Set(missions.flatMap((mission) => mission.stationOwnerMemberId ? [mission.stationOwnerMemberId] : []))].sort().join(",");

  useEffect(() => {
    const memberIds = discovererIdKey ? discovererIdKey.split(",") : [];
    const approvedMembers = new Map(members.map((member) => [member.publicId, member.image]));
    if (currentMember.image) approvedMembers.set(currentMember.publicId, currentMember.image);
    const missingIds = memberIds.filter((memberId) => !approvedMembers.get(memberId));
    if (missingIds.length === 0) return;

    const controller = new AbortController();
    fetch(`/api/members?ids=${encodeURIComponent(missingIds.join(","))}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return [];
        const body: unknown = await response.json();
        if (!Array.isArray(body)) return [];
        return body.flatMap((profile): [string, string][] => {
          if (!profile || typeof profile !== "object") return [];
          const entry = profile as Record<string, unknown>;
          return typeof entry.publicId === "string" && typeof entry.image === "string" && entry.image
            ? [[entry.publicId, entry.image]]
            : [];
        });
      })
      .then((images) => {
        if (!controller.signal.aborted) setDiscovererImages((current) => ({ ...current, ...Object.fromEntries(images) }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [currentMember.publicId, currentMember.image, discovererIdKey, members]);

  function getDiscovererImage(memberId?: string) {
    if (!memberId) return undefined;
    return discovererImages[memberId]
      ?? members.find((member) => member.publicId === memberId)?.image
      ?? (currentMember.publicId === memberId ? currentMember.image : undefined);
  }
  const canViewMissionNotes = (mission: Mission) =>
    canManage || isMissionAssignee(mission, currentMember);

  return (
    <section className="mission-section">
      <div className="toolbar">
        <div className="filter-tabs" role="tablist" aria-label={t("common.filter_by_status")}>
          {(["all", "in_progress", "pending_assigned", "pending_unassigned", "completed"] as MissionFilter[]).filter((item) => item === "all" || item === filter || counts[item] > 0).map((item) => <button aria-selected={filter === item} className={filter === item ? "filter-tab selected" : "filter-tab"} key={item} onClick={() => onFilterChange(item)} role="tab" type="button">{t(missionFilterLabels[item])}<span>{counts[item]}</span></button>)}
        </div>
        <div className="toolbar-actions">
          {onScopeChange && <button aria-label={t(showAll ? "missions.showing_all" : "missions.showing_mine")} aria-pressed={showAll} className={showAll ? "member-icon-action scope-toggle selected" : "member-icon-action scope-toggle"} data-tooltip={t(showAll ? "missions.showing_all" : "missions.showing_mine")} onClick={() => onScopeChange(!showAll)} type="button">{showAll ? <Eye size={15} /> : <EyeOff size={15} />}</button>}
          {!simpleView && <label className="search-field"><Search size={15} /><input aria-label={t("planet.search_missions_planets_users_or_mission_type")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("members.search_missions_users_or_type")} ref={searchInput} value={search} /><kbd>/</kbd></label>}
          {!simpleView && <div aria-label={t("missions.mission_view")} className="view-toggle" role="group">
            <button aria-label={t("navigation.list_view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("navigation.list_view")} type="button"><List size={15} /></button>
            <button aria-label={t("navigation.card_view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("navigation.card_view")} type="button"><LayoutGrid size={15} /></button>
          </div>}
        </div>
      </div>
      {viewMode === "list" ? <div className="mission-table-wrap">
        <table className="mission-table">
          <thead><tr><th>{t("missions.mission_column_heading")}</th><th>{t("common.type_column_heading")}</th><th>{t("common.sector")}</th><th>{t("missions.discoverer_column_heading")}</th><th>{t("missions.assignee_column_heading")}</th><th>{t("missions.priority_column_heading")}</th><th>{t("missions.progress_column_heading")}</th><th>{t("missions.five_part_progress")}</th><th aria-label={t("common.actions_label")} /></tr></thead>
          <tbody>
            {missions.map((mission) => <tr key={mission.id}>
                  <td className="mission-ribbon-cell"><NewMissionRibbon mission={mission} /><div className="mission-name-cell"><span className={`mission-icon ${mission.status === "completed" ? "mission-icon-done" : ""}`}>{mission.status === "completed" ? <Check size={15} /> : <Compass size={15} />}</span><div><span className={`mission-galaxy${(mission.galaxy ?? 0) !== 0 ? " mission-galaxy-alert" : ""}`} data-tooltip={(mission.galaxy ?? 0) !== 0 ? t("missions.galaxy_portals_warning") : undefined} tabIndex={(mission.galaxy ?? 0) !== 0 ? 0 : undefined}>{(mission.galaxy ?? 0) !== 0 && <AlertTriangle size={9} />}{galaxyLabel(mission.galaxy ?? 0)}</span><div className="mission-title-with-info"><button aria-label={`${t("planet.open_planet_details_for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} title={t("planet.open_planet_details")} type="button">{mission.title}</button><PlanetNotesButton mission={mission} onView={setPlanetNoteView} /></div><span className="mission-description">{mission.description}</span></div></div></td>
              <td><span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span></td>
              <td><div className="system-cell"><GlyphStrip address={mission.systemAddress ?? ""} /><span className="system-caption"><span>{systemLabel(mission) || t("system.system_label")}</span></span></div></td>
              <td><DiscovererCell memberId={mission.stationOwnerMemberId} galaxy={mission.galaxy} image={getDiscovererImage(mission.stationOwnerMemberId)} name={mission.stationOwnerName} onOpenProfile={(memberId, messageContext) => setProfileTarget({ memberId, messageContext })} portal={mission.systemAddress} /></td>
              <td><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={(memberId, messageContext) => setProfileTarget({ memberId, messageContext })} /></td>
              <td><span className={`badge badge--priority badge--priority-${mission.priority}`}><span />{t(`common.${mission.priority}`)}</span></td>
              <td><MissionProgress editable={!canManage && mission.assignedMemberId === currentMember.publicId && mission.status !== "completed"} mission={mission} onChange={onUpdateProgress} /></td>
              <td><MissionSystemProgress
                editable={mission.assignedMemberId === currentMember.publicId && (mission.status !== "completed" || (canManage && !simpleView))}
                editableRoles={editableSystemStatusRoles(currentMember)}
                onToggle={(status, checked) => onToggleSystemStatus(mission, status, checked)}
                statuses={planetStatuses[planetSystemStatusKey(mission.systemAddress, mission.galaxy)] ?? []}
              /></td>
              <td><span className="mission-row-actions"><MissionStationLink canManage={canManage} mission={mission} stationOwners={stationOwners} stationOwnersLoaded={stationOwnersLoaded} /><MissionRowAction requestedSpecialty={requestedSpecialty(mission)} canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onReopen={onReopen} onCreateRanger={onCreateRangerMission} onDeleteMission={onDeleteMission} onEdit={onEdit} />{canViewMissionNotes(mission) && <MissionNotesButton mission={mission} onView={setMissionNoteView} />}</span></td>
            </tr>)}
            {loading && <tr><td className="empty-state mission-table-loading" colSpan={9}><LoadingSpinner /></td></tr>}
            {!loading && missions.length === 0 && <tr><td className="empty-state" colSpan={9}><Search size={18} />{t("missions.no_missions_match_the_filters")}</td></tr>}
          </tbody>
        </table>
      </div> : <div className="mission-card-grid">
        {missions.map((mission) => <MissionCard requestedSpecialty={requestedSpecialty} canManage={canManage} stationOwners={stationOwners} stationOwnersLoaded={stationOwnersLoaded} onCreateRangerMission={onCreateRangerMission} currentMember={currentMember} getDiscovererImage={getDiscovererImage} key={mission.id} members={members} mission={mission} onClaim={onClaim} onComplete={onComplete} onReopen={onReopen} onDeleteMission={onDeleteMission} onEdit={onEdit} onOpenPlanet={onOpenPlanet} onOpenProfile={(memberId, messageContext) => setProfileTarget({ memberId, messageContext })} onToggleSystemStatus={onToggleSystemStatus} onUpdateProgress={onUpdateProgress} onViewNotes={setMissionNoteView} onViewPlanetNotes={setPlanetNoteView} systemStatuses={planetStatuses} />)}
        {loading && <div className="mission-cards-loading"><LoadingSpinner /></div>}
        {!loading && missions.length === 0 && <p className="mission-cards-empty">{t("missions.no_missions_match_the_filters")}</p>}
      </div>}
      {!simpleView && <div className="table-footer"><span><span className="footer-live" />{t("missions.showing_visible_of_total_missions", { visible: missions.length, total: counts.all })}</span></div>}
      {profileTarget && <MemberCardDialog memberId={profileTarget.memberId} messageContext={profileTarget.messageContext} onClose={() => setProfileTarget(null)} />}
      {missionNoteView && canViewMissionNotes(missionNoteView) && <div className="dialog-backdrop">
        <dialog aria-labelledby="mission-notes-title" aria-modal="true" className="mission-dialog mission-notes-dialog" open>
          <div className="dialog-heading">
            <div><span className="eyebrow">{missionNoteView.title}</span><h2 id="mission-notes-title">{t("missions.mission_notes")}</h2></div>
            <button aria-label={t("common.close")} className="icon-button" onClick={() => setMissionNoteView(null)} type="button"><X size={18} /></button>
          </div>
          <p className="mission-notes-content">{missionNoteView.notes}</p>
        </dialog>
      </div>}
      {planetNoteView && <div className="dialog-backdrop">
        <dialog aria-labelledby="planet-notes-title" aria-modal="true" className="mission-dialog mission-notes-dialog" open>
          <div className="dialog-heading">
            <div><span className="eyebrow">{planetNoteView.portal}</span><h2 id="planet-notes-title">{t("planet.planet_notes_for")}</h2></div>
            <button aria-label={t("common.close")} className="icon-button" onClick={() => setPlanetNoteView(null)} type="button"><X size={18} /></button>
          </div>
          <ul className="planet-notes-list">{planetNoteView.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </dialog>
      </div>}
    </section>
  );
}