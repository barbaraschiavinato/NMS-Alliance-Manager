import { Eye, EyeOff, Search, X } from "lucide-react";
import { Tabs } from "@/components/layout/tabs";
import { MissionCard } from "@/components/cards/mission-card";
import { isMissionAssignee, type PlanetNotes } from "@/components/cards/mission-card/parts";
import type { Mission, MissionSpecialty, MissionStatus } from "@/lib/missions";
import type { AllianceMember } from "@/lib/access-store";
import { type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useEffect, useState } from "react";
import { MemberCardDialog, type MemberMessageContext } from "@/components/modals/member-card-dialog";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useLocale } from "@/components/providers/locale-provider";
import type { StationOwnerOption } from "@/components/modals/mission-form";

export type MissionFilter = "all" | MissionStatus | "pending_assigned" | "pending_unassigned";
type MissionCounts = Record<MissionFilter, number>;
const missionFilterLabels: Record<MissionFilter, string> = {
  all: "common.all",
  in_progress: "missions.status_in_progress",
  pending: "missions.status_pending",
  pending_assigned: "missions.pending_assigned",
  pending_unassigned: "missions.pending_unassigned",
  completed: "missions.status_completed",
};


export function MissionList({
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
  onStart,
  requestedSpecialty,
  onCreateRangerMission,
  onToggleSystemStatus,
  onUpdateProgress,
  currentMember,
  canManage,
  stationOwners,
  stationOwnersLoaded,
  members,
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
  onStart: (mission: Mission) => void;
  requestedSpecialty: (mission: Mission) => MissionSpecialty | null;
  onCreateRangerMission: (mission: Mission) => void;
  onToggleSystemStatus: (mission: Mission, status: MissionSystemStatus, checked: boolean) => void;
  onUpdateProgress: (mission: Mission, progress: number) => Promise<void>;
  currentMember: AllianceMember;
  canManage: boolean;
  stationOwners: StationOwnerOption[];
  stationOwnersLoaded: boolean;
  members: AllianceMember[];
  planetStatuses: PlanetSystemStatuses;
  loading?: boolean;
}>) {
  const { t } = useLocale();
  const [profileTarget, setProfileTarget] = useState<{ memberId: string; messageContext: MemberMessageContext } | null>(null);
  const [missionNoteView, setMissionNoteView] = useState<Mission | null>(null);
  const [planetNoteView, setPlanetNoteView] = useState<PlanetNotes | null>(null);
  const simpleView = currentMember.simpleView === true;
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
        <Tabs items={(["all", "in_progress", "pending_assigned", "pending_unassigned", "completed"] as MissionFilter[]).filter((item) => item === "all" || item === filter || counts[item] > 0).map((item) => ({ key: item, label: t(missionFilterLabels[item]), count: counts[item], selected: filter === item, onSelect: () => onFilterChange(item) }))} label={t("common.filter_by_status")} />
        <div className="toolbar-actions">
          {onScopeChange && <button aria-label={t(showAll ? "missions.showing_all" : "missions.showing_mine")} aria-pressed={showAll} className={showAll ? "member-icon-action scope-toggle selected" : "member-icon-action scope-toggle"} data-tooltip={t(showAll ? "missions.showing_all" : "missions.showing_mine")} onClick={() => onScopeChange(!showAll)} type="button">{showAll ? <Eye size={15} /> : <EyeOff size={15} />}</button>}
          {<label className="search-field"><Search size={15} /><input aria-label={t("planet.search_missions_planets_users_or_mission_type")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("members.search_missions_users_or_type")} ref={searchInput} value={search} /></label>}
        </div>
      </div>
      <div className="mission-card-grid">
        {missions.map((mission) => <MissionCard requestedSpecialty={requestedSpecialty} canManage={canManage} stationOwners={stationOwners} stationOwnersLoaded={stationOwnersLoaded} onCreateRangerMission={onCreateRangerMission} currentMember={currentMember} getDiscovererImage={getDiscovererImage} key={mission.id} members={members} mission={mission} onClaim={onClaim} onComplete={onComplete} onReopen={onReopen} onStart={onStart} onDeleteMission={onDeleteMission} onEdit={onEdit} onOpenPlanet={onOpenPlanet} onOpenProfile={(memberId, messageContext) => setProfileTarget({ memberId, messageContext })} onToggleSystemStatus={onToggleSystemStatus} onUpdateProgress={onUpdateProgress} onViewNotes={setMissionNoteView} onViewPlanetNotes={setPlanetNoteView} systemStatuses={planetStatuses} />)}
        {loading && <div className="mission-cards-loading"><LoadingSpinner /></div>}
        {!loading && missions.length === 0 && <p className="mission-cards-empty">{t("missions.no_missions_match_the_filters")}</p>}
      </div>
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