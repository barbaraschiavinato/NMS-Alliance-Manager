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

export type MissionFilter = "Tutte" | MissionStatus | "Attesa assegnate" | "Attesa non assegnate";
type MissionCounts = Record<MissionFilter, number>;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const targetSpecialtyNames: Record<MissionSpecialty, string> = {
  all: "Tutti",
  builder: "Costruttori",
  ranger: "Ranger",
  explorer: "Esploratori",
  other: "Altro",
};

const missionProgressStatuses = missionSystemStatuses.filter((status) => status !== "Data error");

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
      <button aria-label={`${t("Edit")} ${mission.title}`} className="row-action" data-tooltip={t("Edit mission")} onClick={() => onEdit(mission)} type="button"><Pencil size={15} /></button>
      <button aria-label={`${t("Delete")} ${mission.title}`} className="row-action row-action-delete" data-tooltip={t("Delete mission")} onClick={() => onDeleteMission(mission)} type="button"><Trash2 size={15} /></button>
    </span>;
  }
  if (mission.assignedEmail === currentMember.email && mission.status !== "Completata") {
    return <button className="claim-button mission-action-button" onClick={() => onComplete(mission)} type="button">{t("Complete mission")}</button>;
  }
  if (!mission.assignedEmail && !mission.assignedTo.trim()) {
    return <button className="claim-button mission-action-button" onClick={() => onClaim(mission)} type="button">{t("Claim")}</button>;
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
  const name = mission.assignedTo || t("Not assigned");
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
  const label = name || email || t("Not specified");
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

  const completed = mission.status === "Completata";
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
  const hasDataError = statuses.includes("Data error");
  const canUpdateSystemStatus = mission.assignedEmail?.toLowerCase() === currentMember.email.toLowerCase();
  return <article className="mission-card">
    <div className="mission-card-heading">
      <div className="mission-name-cell">
        <MissionPlanetThumbnail mission={mission} />
        <div>
          <button aria-label={`${t("Open planet details for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} type="button">{mission.title}</button>
          {mission.description && <span className="mission-description">{mission.description}</span>}
        </div>
      </div>
      <span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span>
    </div>
    <div className="mission-card-system">
      <GlyphStrip address={mission.systemAddress ?? ""} />
      <span>{mission.system || t("System")} · {galaxyLabel(mission.galaxy ?? 0)}</span>
    </div>
    <div className="mission-card-people">
      <div><small>{t("DISCOVERER")}</small><DiscovererCell email={mission.stationOwnerEmail} image={getDiscovererImage(mission.stationOwnerEmail)} name={mission.stationOwnerName} onOpenProfile={onOpenProfile} /></div>
      <div><small>{t("ASSIGNEE")}</small><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={onOpenProfile} /></div>
    </div>
    <div className="mission-card-progress">
      <span className={`badge badge--priority badge--priority-${mission.priority.toLowerCase()}`}><span />{t(mission.priority)}</span>
      <div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div>
    </div>
    <div className="mission-card-actions">
      <span
        aria-label={hasDataError
          ? t("System progress: data error")
          : t("System progress: {current} of {total} complete", {
            current: missionProgressStatuses.filter((status) => statuses.includes(status)).length,
            total: missionProgressStatuses.length,
          })}
        className="mission-system-progress"
        role="group"
      >
        {missionProgressStatuses.map((status) => {
          const tooltip = t(hasDataError ? "Data error" : status);
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
        <div className="filter-tabs" role="tablist" aria-label={t("Filter by status")}>
          {(["Tutte", "In corso", "Attesa assegnate", "Attesa non assegnate", "Completata"] as MissionFilter[]).map((item) => <button aria-selected={filter === item} className={filter === item ? "filter-tab selected" : "filter-tab"} key={item} onClick={() => onFilterChange(item)} role="tab" type="button">{t(item)}<span>{counts[item]}</span></button>)}
        </div>
        <div className="toolbar-actions">
          <label className="search-field"><Search size={15} /><input aria-label={t("Search missions, planets, users, or mission type")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("Search missions, users, or type")} ref={searchInput} value={search} /><kbd>/</kbd></label>
          <div aria-label={t("Mission view")} className="view-toggle" role="group">
            <button aria-label={t("List view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("List view")} type="button"><List size={15} /></button>
            <button aria-label={t("Card view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("Card view")} type="button"><LayoutGrid size={15} /></button>
          </div>
        </div>
      </div>
      {viewMode === "list" ? <div className="mission-table-wrap">
        <table className="mission-table">
          <thead><tr><th>{t("MISSION")}</th><th>{t("TYPE")}</th><th>{t("SECTOR")}</th><th>{t("DISCOVERER")}</th><th>{t("ASSIGNEE")}</th><th>{t("PRIORITY")}</th><th>{t("PROGRESS")}</th><th aria-label={t("Actions")} /></tr></thead>
          <tbody>
            {missions.map((mission) => <tr key={mission.id}>
                  <td><div className="mission-name-cell"><span className={`mission-icon ${mission.status === "Completata" ? "mission-icon-done" : ""}`}>{mission.status === "Completata" ? <Check size={15} /> : <Compass size={15} />}</span><div><button aria-label={`${t("Open planet details for")} ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} title={t("Open planet details")} type="button">{mission.title}</button><span className="mission-description">{mission.description}</span></div></div></td>
              <td><span className={`badge badge--specialty badge--specialty-${mission.targetSpecialty ?? "all"}`}>{t(targetSpecialtyNames[mission.targetSpecialty ?? "all"])}</span></td>
              <td><div className="system-cell"><GlyphStrip address={mission.systemAddress ?? ""} /><span className="system-caption">{mission.system || t("System")} · {galaxyLabel(mission.galaxy ?? 0)}</span></div></td>
              <td><DiscovererCell email={mission.stationOwnerEmail} image={getDiscovererImage(mission.stationOwnerEmail)} name={mission.stationOwnerName} onOpenProfile={setProfileEmail} /></td>
              <td><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={setProfileEmail} /></td>
              <td><span className={`badge badge--priority badge--priority-${mission.priority.toLowerCase()}`}><span />{t(mission.priority)}</span></td>
              <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div></td>
              <td><MissionRowAction canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} /></td>
            </tr>)}
            {loading && <tr><td className="empty-state mission-table-loading" colSpan={8}><LoadingSpinner /></td></tr>}
            {!loading && missions.length === 0 && <tr><td className="empty-state" colSpan={8}><Search size={18} />{t("No missions match the filters.")}</td></tr>}
          </tbody>
        </table>
      </div> : <div className="mission-card-grid">
        {missions.map((mission) => <MissionCard canManage={canManage} currentMember={currentMember} getDiscovererImage={getDiscovererImage} key={mission.id} members={members} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} onOpenPlanet={onOpenPlanet} onOpenProfile={setProfileEmail} onToggleSystemStatus={onToggleSystemStatus} systemStatuses={planetStatuses} />)}
        {loading && <div className="mission-cards-loading"><LoadingSpinner /></div>}
        {!loading && missions.length === 0 && <p className="mission-cards-empty">{t("No missions match the filters.")}</p>}
      </div>}
      <div className="table-footer"><span><span className="footer-live" />{t("Showing {visible} of {total} missions", { visible: missions.length, total: counts.Tutte })}</span></div>
      {profileEmail && <MemberCardDialog email={profileEmail} onClose={() => setProfileEmail(null)} />}
    </section>
  );
}