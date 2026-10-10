"use client";

import { AlertTriangle } from "lucide-react";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { galaxyLabel } from "@/lib/galaxies";
import { planetSystemStatusKey } from "@/lib/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";
import { StationSystemCoreInfo } from "@/components/shared/station-system-core-info";
import { editableSystemStatusRoles, systemProgressCap, systemProgressFloor } from "@/lib/planet-system-status";
import { MissionSystemProgress } from "@/components/shared/mission-system-progress";
import { isMissionAssignee, targetSpecialtyNames, MissionRowAction, MissionStationLink, AssigneeCell, DiscovererCell, MissionProgress, MissionNotesButton, PlanetNotesButton, MissionPlanetThumbnail, NewMissionRibbon } from "@/components/cards/mission-card/parts";
import type { MissionCardProps } from "@/components/cards/mission-card/parts";

export function MissionCardSimple({ onReopen, onStart, mission, systemStatuses, currentMember, canManage, stationOwners, stationOwnersLoaded, requestedSpecialty, onCreateRangerMission, members, onEdit, onDeleteMission, onOpenPlanet, onClaim, onComplete, onToggleSystemStatus, onUpdateProgress, onViewNotes, onViewPlanetNotes, onOpenProfile, getDiscovererImage }: MissionCardProps) {
  const { t } = useLocale();
  const statuses = systemStatuses[planetSystemStatusKey(mission.systemAddress, mission.galaxy)] ?? [];
  const locked = (mission.status === "completed" && (currentMember.simpleView === true || !canManage));
  const canUpdateSystemStatus = mission.assignedMemberId === currentMember.publicId && !locked && mission.status !== "pending";
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
      <StationSystemCoreInfo key={`${mission.systemAddress}:${mission.galaxy}`} galaxy={mission.galaxy ?? 0} portal={mission.systemAddress ?? ""} />
    </div>
    <div className="mission-card-people">
      <div><small>{t("missions.discoverer_column_heading")}</small><DiscovererCell memberId={mission.stationOwnerMemberId} galaxy={mission.galaxy} image={getDiscovererImage(mission.stationOwnerMemberId)} name={mission.stationOwnerName} onOpenProfile={onOpenProfile} portal={mission.systemAddress} /></div>
      <div><small>{t("missions.assignee_column_heading")}</small><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={onOpenProfile} /></div>
    </div>
    <div className="mission-card-progress">
      <span className={`badge badge--priority badge--priority-${mission.priority}`}><span />{t(`common.${mission.priority}`)}</span>
      <MissionProgress readOnlyFloor={systemProgressFloor(statuses, mission.targetSpecialty)} editable={canUpdateProgress} minimum={systemProgressFloor(statuses, currentMember.specialty ?? "")} mission={mission} onChange={onUpdateProgress} />
    </div>
    <div className="mission-card-actions">
      <MissionSystemProgress editable={canUpdateSystemStatus} editableRoles={editableSystemStatusRoles(currentMember)} onToggle={(status, checked) => onToggleSystemStatus(mission, status, checked)} statuses={statuses} />
      <div className="mission-card-action-buttons">
        <MissionStationLink canManage={canManage} mission={mission} stationOwners={stationOwners} stationOwnersLoaded={stationOwnersLoaded} />
        <MissionRowAction tasksDone={systemProgressFloor(statuses, currentMember.specialty ?? "") >= systemProgressCap} requestedSpecialty={requestedSpecialty(mission)} canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onReopen={onReopen} onStart={onStart} onCreateRanger={onCreateRangerMission} onDeleteMission={onDeleteMission} onEdit={onEdit} />
        {canViewNotes && <MissionNotesButton mission={mission} onView={onViewNotes} />}
      </div>
    </div>
  </article>;
}

