import { Check, CirclePlus, Compass, FileText, Hammer, Info, Orbit, Pencil, RotateCcw, Search, ShieldPlus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Mission, MissionSpecialty } from "@/lib/missions";
import type { AllianceMember } from "@/lib/access-store";
import { type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useEffect, useRef, useState } from "react";
import { type MemberMessageContext } from "@/components/modals/member-card-dialog";
import { useLocale } from "@/components/providers/locale-provider";
import type { StationOwnerOption } from "@/components/modals/mission-form";


export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function isMissionAssignee(mission: Mission, member: AllianceMember): boolean {
  return Boolean(mission.assignedMemberId && mission.assignedMemberId === member.publicId);
}

export const targetSpecialtyNames: Record<MissionSpecialty, string> = {
  all: "common.all",
  explorer_builder: "common.explorers_and_builders",
  builder: "common.builders",
  ranger: "common.ranger",
  explorer: "common.explorers",
  other: "common.other",
};

export const requestTooltipKeys = {
  ranger: "missions.create_ranger_mission",
  explorer: "missions.create_explorer_mission",
  builder: "missions.create_builder_mission",
  all: "missions.create_ranger_mission",
  other: "missions.create_ranger_mission",
  explorer_builder: "missions.create_ranger_mission",
} as const;

export function MissionRowAction({ mission, currentMember, canManage, requestedSpecialty = null, onCreateRanger, onEdit, onDeleteMission, onClaim, onComplete, onReopen, onStart, tasksDone = true }: Readonly<{
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
  onStart: (mission: Mission) => void;
  tasksDone?: boolean;
}>) {
  const { t } = useLocale();
  const requestButton = requestedSpecialty && onCreateRanger && <button aria-label={t(requestTooltipKeys[requestedSpecialty])} className={`row-action row-action-${requestedSpecialty}`} data-tooltip={t(requestTooltipKeys[requestedSpecialty])} onClick={() => onCreateRanger(mission)} type="button">{requestedSpecialty === "builder" ? <Hammer size={15} /> : requestedSpecialty === "ranger" ? <Compass size={15} /> : requestedSpecialty === "explorer" ? <Search size={15} /> : <ShieldPlus size={15} />}</button>;
  if (mission.status === "completed" && (currentMember.simpleView === true || !canManage)) {
    if (mission.assignedMemberId === currentMember.publicId) {
      return <span className="mission-row-actions">{requestButton}<button aria-label={t("missions.reopen_mission")} className="row-action row-action-reopen" data-tooltip={t("missions.reopen_mission")} onClick={() => onReopen(mission)} type="button"><RotateCcw size={15} /></button></span>;
    }
    return <span className="no-row-action">—</span>;
  }
  if (canManage) {
    return <span className="mission-row-actions">
      {requestButton}
      {mission.status === "completed" && mission.assignedMemberId === currentMember.publicId && <button aria-label={t("missions.reopen_mission")} className="row-action row-action-reopen" data-tooltip={t("missions.reopen_mission")} onClick={() => onReopen(mission)} type="button"><RotateCcw size={15} /></button>}
      <button aria-label={`${t("common.edit")} ${mission.title}`} className="row-action row-action-edit" data-tooltip={t("missions.edit_mission")} onClick={() => onEdit(mission)} type="button"><Pencil size={15} /></button>
      <button aria-label={`${t("common.delete")} ${mission.title}`} className="row-action row-action-delete" data-tooltip={t("missions.delete_mission")} onClick={() => onDeleteMission(mission)} type="button"><Trash2 size={15} /></button>
    </span>;
  }
  if (mission.assignedMemberId === currentMember.publicId && mission.status === "pending") {
    return <button className="claim-button claim-button-progress mission-action-button" onClick={() => onStart(mission)} type="button">{t("missions.start_mission")}</button>;
  }
  if (mission.assignedMemberId === currentMember.publicId && mission.status !== "completed") {
    return <button className="claim-button mission-action-button" disabled={!tasksDone} onClick={() => onComplete(mission)} type="button">{t("missions.complete_mission")}</button>;
  }
  if (!mission.assignedMemberId && !mission.assignedTo.trim()) {
    return <button className="claim-button claim-button-take mission-action-button" onClick={() => onClaim(mission)} type="button">{t("missions.claim")}</button>;
  }
  return <span className="no-row-action">—</span>;
}

export function MissionStationLink({ mission, canManage, stationOwners, stationOwnersLoaded }: Readonly<{
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

export function AssigneeCell({ mission, members, currentMember, onOpenProfile }: Readonly<{
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

export function DiscovererCell({ memberId, name, image, portal, galaxy, onOpenProfile }: Readonly<{
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

export function MissionProgress({ mission, editable, minimum = 0, readOnlyFloor = 0, onChange }: Readonly<{
  mission: Mission;
  editable: boolean;
  minimum?: number;
  readOnlyFloor?: number;
  onChange: (mission: Mission, progress: number) => Promise<void>;
}>) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<{ source: number; value: number } | null>(null);
  const [seenProgress, setSeenProgress] = useState(mission.progress);
  if (seenProgress !== mission.progress) {
    setSeenProgress(mission.progress);
    setDraft(null);
  }
  const progress = draft?.source === mission.progress ? draft.value : mission.progress;
  const committedProgress = useRef(mission.progress);

  useEffect(() => {
    committedProgress.current = mission.progress;
  }, [mission.progress]);

  function commitProgress(rawValue: number) {
    const value = Math.max(rawValue, minimum);
    setDraft({ source: mission.progress, value });
    if (value === committedProgress.current) return;
    committedProgress.current = value;
    void onChange(mission, value).catch(() => {
      committedProgress.current = mission.progress;
      setDraft(null);
    });
  }

  if (mission.targetSpecialty !== "ranger" && mission.targetSpecialty !== "explorer" && mission.targetSpecialty !== "builder") return null;

  const shownProgress = editable ? progress : mission.progress === 0 ? readOnlyFloor : mission.progress;

  return <div className={`progress-cell progress-cell-${mission.targetSpecialty}${editable ? " progress-cell-editable" : ""}`}>
    {editable
      ? <input
        aria-label={t("missions.progress_for_mission", { title: mission.title })}
        max={100}
        min={0}
        onBlur={(event) => commitProgress(Number(event.currentTarget.value))}
        onChange={(event) => setDraft({ source: mission.progress, value: Math.max(Number(event.target.value), minimum) })}
        onKeyUp={(event) => commitProgress(Number(event.currentTarget.value))}
        onPointerUp={(event) => commitProgress(Number(event.currentTarget.value))}
        type="range"
        value={progress}
      />
      : <div aria-hidden="true" className="progress-track"><span style={{ width: `${shownProgress}%` }} /></div>}
    <span>{shownProgress}%</span>
  </div>;
}

export function MissionNotesButton({ mission, onView }: Readonly<{
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

export type PlanetNotes = Readonly<{ title: string; portal: string; notes: string[] }>;
export const planetNotesRequests = new Map<string, Promise<string[]>>();
const planetNotesCache = new Map<string, Readonly<{ notes: string[]; expiresAt: number }>>();
const planetNotesCacheMs = 30_000;

export function readPlanetNotes(mission: Mission): Promise<string[]> {
  const key = mission.id;
  const cached = planetNotesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.notes);
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
    planetNotesCache.set(key, { notes, expiresAt: Date.now() + planetNotesCacheMs });
    return notes;
  }).catch((error: unknown) => {
    if (planetNotesRequests.get(key) === request) planetNotesRequests.delete(key);
    throw error;
  });
  planetNotesRequests.set(key, request);
  return request;
}

export function PlanetNotesButton({ mission, onView }: Readonly<{
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
      .catch(() => {
        if (active) setHasNotes(false);
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
      .catch(() => undefined)}
    type="button"
  ><Info size={14} /></button>;
}

export function MemberAvatar({ image, label }: Readonly<{ image?: string; label: string }>) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = label.slice(0, 2).toUpperCase() || "—";

  return <span aria-hidden="true" className={`assignee-avatar ${image && !imageFailed ? "assignee-avatar-image" : ""}`}>
    {image && !imageFailed
      ? <Image alt="" height={21} onError={() => setImageFailed(true)} src={image} unoptimized width={21} />
      : initials}
  </span>;
}

export function MissionPlanetThumbnail({ mission }: Readonly<{ mission: Mission }>) {
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

export function NewMissionRibbon({ mission }: Readonly<{ mission: Mission }>) {
  const { t } = useLocale();
  if (mission.status === "completed") return <span className="station-new-ribbon-clip"><span className="station-new-ribbon station-completed-ribbon">{t("missions.status_completed")}</span></span>;
  if (!mission.assignedMemberId?.trim() && !mission.assignedTo.trim()) return <span className="station-new-ribbon-clip"><span className="station-new-ribbon station-available-ribbon">{t("missions.available_ribbon")}</span></span>;
  return null;
}

export type MissionCardProps = Readonly<{
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
  onStart: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  onUpdateProgress: (mission: Mission, progress: number) => Promise<void>;
  onViewNotes: (mission: Mission) => void;
  onViewPlanetNotes: (notes: PlanetNotes) => void;
  onOpenProfile: (memberId: string, context: MemberMessageContext) => void;
  getDiscovererImage: (memberId?: string) => string | undefined;
}>;

