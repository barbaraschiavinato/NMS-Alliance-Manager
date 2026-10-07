import { Check, Compass, LayoutGrid, List, Pencil, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import type { Mission, MissionSpecialty, MissionStatus } from "@/lib/missions";
import { GlyphStrip } from "@/components/portal-address-field";
import type { AllianceMember } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";
import { missionSystemStatuses, planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useEffect, useState } from "react";
import { MemberCardDialog } from "@/components/member-card-dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useLocale } from "@/components/locale-provider";

export type MissionFilter = "all" | MissionStatus | "pending_assigned" | "pending_unassigned";
type MissionCounts = Record<MissionFilter, number>;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const targetSpecialtyNames: Record<MissionSpecialty, string> = {
  all: "common.all",
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

const missionProgressStatuses = missionSystemStatuses.filter((status) => status !== "data_error");

function MissionRowAction({ mission, currentMember, canManage, onEdit, onDeleteMission, onClaim, onComplete }: Readonly<{
  mission: Mission;
  currentMember: AllianceMember;
  canManage: boolean;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
}>) {
  const { t } = useLocale();
  if (canManage) {
    return <span className="mission-row-actions">
      <button aria-label={`${t("common.edit")} ${mission.title}`} className="row-action" data-tooltip={t("missions.edit_mission")} onClick={() => onEdit(mission)} type="button"><Pencil size={15} /></button>
      <button aria-label={`${t("common.delete")} ${mission.title}`} className="row-action row-action-delete" data-tooltip={t("missions.delete_mission")} onClick={() => onDeleteMission(mission)} type="button"><Trash2 size={15} /></button>
    </span>;
  }
  if (mission.assignedEmail === currentMember.email && mission.status !== "completed") {
    return <button className="claim-button mission-action-button" onClick={() => onComplete(mission)} type="button">{t("missions.complete_mission")}</button>;
  }
  if (!mission.assignedEmail && !mission.assignedTo.trim()) {
    return <button className="claim-button mission-action-button" onClick={() => onClaim(mission)} type="button">{t("missions.claim")}</button>;
  }
  return <span className="no-row-action">—</span>;
}

function AssigneeCell({ mission, members, currentMember, onOpenProfile }: Readonly<{
  mission: Mission;
  members: AllianceMember[];
  currentMember: AllianceMember;
  onOpenProfile: (email: string) => void;
}>) {
  const { t } = useLocale();
  const assignedMember = members.find((member) => member.email === mission.assignedEmail)
    ?? (mission.assignedEmail === currentMember.email ? currentMember : undefined)
    ?? ([currentMember.nmsName, currentMember.name].includes(mission.assignedTo) ? currentMember : undefined)
    ?? members.find((member) => member.nmsName === mission.assignedTo || member.name === mission.assignedTo);
  const image = assignedMember?.image;
  const name = mission.assignedTo || t("missions.not_assigned");
  const email = mission.assignedEmail || assignedMember?.email;

  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={mission.assignedTo || "—"} />
    {name}
  </>;
  return email
    ? <button className="assignee-cell mission-member-link" onClick={() => onOpenProfile(email)} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
}

function DiscovererCell({ email, name, image, onOpenProfile }: Readonly<{
  email?: string;
  name?: string;
  image?: string;
  onOpenProfile: (email: string) => void;
}>) {
  const { t } = useLocale();
  const label = name || email || t("common.not_specified");
  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={label} />
    {label}
  </>;

  return email
    ? <button className="assignee-cell mission-member-link" onClick={() => onOpenProfile(email)} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
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

function MissionCard({ mission, systemStatuses, currentMember, canManage, members, onEdit, onDeleteMission, onOpenPlanet, onClaim, onComplete, onToggleSystemStatus, onOpenProfile, getDiscovererImage }: Readonly<{
  mission: Mission;
  systemStatuses: PlanetSystemStatuses;
  currentMember: AllianceMember;
  canManage: boolean;
  members: AllianceMember[];
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  onOpenProfile: (email: string) => void;
  getDiscovererImage: (email?: string) => string | undefined;
}>) {
  const { t } = useLocale();
  const statuses = systemStatuses[planetSystemStatusKey(mission.systemAddress, mission.galaxy)] ?? [];
  const hasDataError = statuses.includes("data_error");
  const canUpdateSystemStatus = mission.assignedEmail?.toLowerCase() === currentMember.email.toLowerCase();
  return <article className="mission-card">
    <div className="mission-card-heading">
      <div className="mission-name-cell">
        <MissionPlanetThumbnail mission={mission} />
        <div>
          <button aria-label={`${t("planet.open_planet_details_for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} type="button">{mission.title}</button>
          {mission.description && <span className="mission-description">{mission.description}</span>}
        </div>
      </div>
      <span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span>
    </div>
    <div className="mission-card-system">
      <GlyphStrip address={mission.systemAddress ?? ""} />
      <span>{mission.system || t("system.system_label")} · {galaxyLabel(mission.galaxy ?? 0)}</span>
    </div>
    <div className="mission-card-people">
      <div><small>{t("missions.discoverer_column_heading")}</small><DiscovererCell email={mission.stationOwnerEmail} image={getDiscovererImage(mission.stationOwnerEmail)} name={mission.stationOwnerName} onOpenProfile={onOpenProfile} /></div>
      <div><small>{t("missions.assignee_column_heading")}</small><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={onOpenProfile} /></div>
    </div>
    <div className="mission-card-progress">
      <span className={`badge badge--priority badge--priority-${mission.priority}`}><span />{t(`common.${mission.priority}`)}</span>
      <div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div>
    </div>
    <div className="mission-card-actions">
      <span
        aria-label={hasDataError
          ? t("errors.system_progress_data_error")
          : t("missions.system_progress_current_of_total_complete", {
            current: missionProgressStatuses.filter((status) => statuses.includes(status)).length,
            total: missionProgressStatuses.length,
          })}
        className="mission-system-progress"
        role="group"
      >
        {missionProgressStatuses.map((status) => {
          const tooltip = t(hasDataError ? "system.data_error" : status);
          return (
            <label aria-label={tooltip} className={`mission-system-progress-item${canUpdateSystemStatus ? " mission-system-progress-item-editable" : ""}`} key={status} title={tooltip}>
              {canUpdateSystemStatus && (
                <input
                  aria-label={tooltip}
                  checked={statuses.includes(status)}
                  onChange={(event) => onToggleSystemStatus(mission, status, event.target.checked)}
                  type="checkbox"
                />
              )}
              <span
                aria-hidden="true"
                className={hasDataError
                  ? "mission-system-progress-square mission-system-progress-square-error"
                  : `mission-system-progress-square${statuses.includes(status) ? " mission-system-progress-square-done" : ""}`}
              />
              <span aria-hidden="true" className="mission-system-progress-tooltip">{tooltip}</span>
            </label>
          );
        })}
      </span>
      <MissionRowAction canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} />
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
  onEdit,
  onDeleteMission,
  onOpenPlanet,
  onClaim,
  onComplete,
  onToggleSystemStatus,
  currentMember,
  canManage,
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
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  currentMember: AllianceMember;
  canManage: boolean;
  members: AllianceMember[];
  defaultView: "list" | "cards";
  planetStatuses: PlanetSystemStatuses;
  loading?: boolean;
}>) {
  const { t } = useLocale();
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const viewMode = viewOverride ?? defaultView;
  const [discovererImages, setDiscovererImages] = useState<Record<string, string>>({});
  const discovererEmailKey = [...new Set(missions.flatMap((mission) => mission.stationOwnerEmail ? [mission.stationOwnerEmail] : []))].sort().join(",");

  useEffect(() => {
    const emails = discovererEmailKey ? discovererEmailKey.split(",") : [];
    const approvedMembers = new Map(members.map((member) => [member.email.toLowerCase(), member.image]));
    if (currentMember.image) approvedMembers.set(currentMember.email.toLowerCase(), currentMember.image);
    const missingEmails = emails.filter((email) => !approvedMembers.get(email.toLowerCase()));
    if (missingEmails.length === 0) return;

    const controller = new AbortController();
    fetch(`/api/members?emails=${encodeURIComponent(missingEmails.join(","))}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return [];
        const body: unknown = await response.json();
        if (!Array.isArray(body)) return [];
        return body.flatMap((profile): [string, string][] => {
          if (!profile || typeof profile !== "object") return [];
          const entry = profile as Record<string, unknown>;
          return typeof entry.email === "string" && typeof entry.image === "string" && entry.image
            ? [[entry.email.toLowerCase(), entry.image]]
            : [];
        });
      })
      .then((images) => {
        if (!controller.signal.aborted) setDiscovererImages((current) => ({ ...current, ...Object.fromEntries(images) }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [currentMember.email, currentMember.image, discovererEmailKey, members]);

  function getDiscovererImage(email?: string) {
    if (!email) return undefined;
    return discovererImages[email.toLowerCase()]
      ?? members.find((member) => member.email.toLowerCase() === email.toLowerCase())?.image
      ?? (currentMember.email.toLowerCase() === email.toLowerCase() ? currentMember.image : undefined);
  }

  return (
    <section className="mission-section">
      <div className="toolbar">
        <div className="filter-tabs" role="tablist" aria-label={t("common.filter_by_status")}>
          {(["all", "in_progress", "pending_assigned", "pending_unassigned", "completed"] as MissionFilter[]).map((item) => <button aria-selected={filter === item} className={filter === item ? "filter-tab selected" : "filter-tab"} key={item} onClick={() => onFilterChange(item)} role="tab" type="button">{t(missionFilterLabels[item])}<span>{counts[item]}</span></button>)}
        </div>
        <div className="toolbar-actions">
          <label className="search-field"><Search size={15} /><input aria-label={t("planet.search_missions_planets_users_or_mission_type")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("members.search_missions_users_or_type")} ref={searchInput} value={search} /><kbd>/</kbd></label>
          <div aria-label={t("missions.mission_view")} className="view-toggle" role="group">
            <button aria-label={t("navigation.list_view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("navigation.list_view")} type="button"><List size={15} /></button>
            <button aria-label={t("navigation.card_view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("navigation.card_view")} type="button"><LayoutGrid size={15} /></button>
          </div>
        </div>
      </div>
      {viewMode === "list" ? <div className="mission-table-wrap">
        <table className="mission-table">
          <thead><tr><th>{t("missions.mission_column_heading")}</th><th>{t("common.type_column_heading")}</th><th>{t("common.sector")}</th><th>{t("missions.discoverer_column_heading")}</th><th>{t("missions.assignee_column_heading")}</th><th>{t("missions.priority_column_heading")}</th><th>{t("missions.progress_column_heading")}</th><th aria-label={t("common.actions_label")} /></tr></thead>
          <tbody>
            {missions.map((mission) => <tr key={mission.id}>
                  <td><div className="mission-name-cell"><span className={`mission-icon ${mission.status === "completed" ? "mission-icon-done" : ""}`}>{mission.status === "completed" ? <Check size={15} /> : <Compass size={15} />}</span><div><button aria-label={`${t("planet.open_planet_details_for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} title={t("planet.open_planet_details")} type="button">{mission.title}</button><span className="mission-description">{mission.description}</span></div></div></td>
              <td><span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span></td>
              <td><div className="system-cell"><GlyphStrip address={mission.systemAddress ?? ""} /><span className="system-caption">{mission.system || t("system.system_label")} · {galaxyLabel(mission.galaxy ?? 0)}</span></div></td>
              <td><DiscovererCell email={mission.stationOwnerEmail} image={getDiscovererImage(mission.stationOwnerEmail)} name={mission.stationOwnerName} onOpenProfile={setProfileEmail} /></td>
              <td><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={setProfileEmail} /></td>
              <td><span className={`badge badge--priority badge--priority-${mission.priority}`}><span />{t(`common.${mission.priority}`)}</span></td>
              <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div></td>
              <td><MissionRowAction canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} /></td>
            </tr>)}
            {loading && <tr><td className="empty-state mission-table-loading" colSpan={8}><LoadingSpinner /></td></tr>}
            {!loading && missions.length === 0 && <tr><td className="empty-state" colSpan={8}><Search size={18} />{t("missions.no_missions_match_the_filters")}</td></tr>}
          </tbody>
        </table>
      </div> : <div className="mission-card-grid">
        {missions.map((mission) => <MissionCard canManage={canManage} currentMember={currentMember} getDiscovererImage={getDiscovererImage} key={mission.id} members={members} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} onOpenPlanet={onOpenPlanet} onOpenProfile={setProfileEmail} onToggleSystemStatus={onToggleSystemStatus} systemStatuses={planetStatuses} />)}
        {loading && <div className="mission-cards-loading"><LoadingSpinner /></div>}
        {!loading && missions.length === 0 && <p className="mission-cards-empty">{t("missions.no_missions_match_the_filters")}</p>}
      </div>}
      <div className="table-footer"><span><span className="footer-live" />{t("missions.showing_visible_of_total_missions", { visible: missions.length, total: counts.all })}</span></div>
      {profileEmail && <MemberCardDialog email={profileEmail} onClose={() => setProfileEmail(null)} />}
    </section>
  );
}