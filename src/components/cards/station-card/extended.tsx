"use client";

import Image from "next/image";
import { DetailLink as Link } from "@/components/shared/detail-page";
import { CirclePlus, Crosshair, FileText, Pencil, Trash2, ExternalLink } from "lucide-react";
import { missionDetailHref, stationDetailHref } from "@/lib/navigation/detail-links";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { StationSystemCoreInfo } from "@/components/shared/station-system-core-info";
import { SystemFeatureBadge } from "@/components/shared/system-feature-badge";
import { MissionSystemProgress } from "@/components/shared/mission-system-progress";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { editableSystemStatusRoles, planetSystemStatusKey } from "@/lib/planets/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";
import {
  GalaxyLabel,
  canCreateMissionFromStation,
  cachedPlanetType,
  stationOwnerName,
  StationOwnerCell,
  cachedPlanetTitle,
  cachedPlanetImageUrl,
  CachedPlanetInfo,
} from "@/components/cards/station-card/parts";
import type { StationCardProps } from "@/components/cards/station-card/parts";

export function StationCardExtended({
  station,
  member,
  canSeeAll,
  canCreateMissions,
  renderedAt,
  planetStatuses,
  planetStatusesLoaded,
  savingStatusKeys,
  onToggleStatus,
  onOpenStation,
  onOpenProfile,
  onCreateMission,
  onEdit,
  onRemove,
  onViewNote,
  showDetailLink = true,
  showAssociatedMissionsLink = true,
  isAllianceHub = false,
}: StationCardProps) {
  const { t } = useLocale();
  const planetImageUrl = cachedPlanetImageUrl(station.planet);
  const stationDisplayName =
    station.name || cachedPlanetType(station.planet) || cachedPlanetTitle(station.planet) || t("planet.unnamed_planet");
  const statusKey = planetSystemStatusKey(station.portal, station.galaxy);
  const createdTime = station.createdAt ? Date.parse(station.createdAt) : Number.NaN;
  const isNewStation =
    !station.hasMissions && Number.isFinite(createdTime) && renderedAt - createdTime < 7 * 24 * 60 * 60 * 1000;
  const canEditStation = canSeeAll || station.ownerId === member.publicId;
  const canCreateMission = canCreateMissionFromStation(station, member, canCreateMissions);
  const showCreateMissionPrompt = canCreateMission && member.specialty !== "ranger";
  const newRibbon = (isAllianceHub || isNewStation) && (
    <span className="station-new-ribbon-clip">
      <span className={`station-new-ribbon${isAllianceHub ? " station-hub-ribbon" : ""}`}>
        {t(isAllianceHub ? "stations.alliance_hub_badge" : "stations.new_badge")}
      </span>
    </span>
  );
  const createMissionRibbon = showCreateMissionPrompt && (
    <span className="station-mission-ribbon-clip">
      <span className="station-mission-create-ribbon">{t("stations.create_mission_ribbon")}</span>
    </span>
  );
  const stationOwner = (
    <StationOwnerCell
      onOpenProfile={(memberId) =>
        onOpenProfile({
          memberId,
          messageContext: {
            type: "planet",
            portal: station.portal,
            galaxy: station.galaxy,
            subjectLabel: station.name || cachedPlanetTitle(station.planet) || cachedPlanetType(station.planet),
          },
        })
      }
      ownerLabel={t("stations.station_owner")}
      station={station}
    />
  );
  return (
    <li
      className={`station-card-extended${isAllianceHub || isNewStation ? " station-is-new" : ""}${
        canCreateMission ? " station-can-create-mission" : ""
      }`}
    >
      {newRibbon}
      {createMissionRibbon}
      {
        <button
          className={`station-card-title${planetImageUrl ? " station-card-title-with-image" : ""}`}
          onClick={() => onOpenStation(station)}
          type="button"
        >
          {planetImageUrl && (
            <Image
              alt=""
              className="station-card-planet-image"
              height={112}
              src={planetImageUrl}
              unoptimized
              width={112}
            />
          )}
          <span className="station-card-title-copy">
            <GalaxyLabel galaxy={station.galaxy} />
            <strong>{stationDisplayName}</strong>
            <StationSystemCoreInfo
              key={`${station.portal}:${station.galaxy}`}
              galaxy={station.galaxy}
              portal={station.portal}
            />
            <SystemFeatureBadge galaxy={station.galaxy} portal={station.portal} />
          </span>
        </button>
      }
      <div className="station-card-owner">{stationOwner}</div>
      <div className="station-portal-code">
        <strong className="station-name">{stationDisplayName}</strong>
        <GlyphStrip address={station.portal} />
        <code>{station.portal}</code>
      </div>
      <div className="station-planet-info-list">
        {station.planet ? (
          <CachedPlanetInfo onOpen={() => onOpenStation(station)} planet={station.planet} />
        ) : (
          <p className="station-card-no-planet">{t("planet.no_almanac_data")}</p>
        )}
      </div>
      <div className="station-card-footer">
        {(canSeeAll || station.ownerId === member.publicId) && planetStatusesLoaded && (
          <div className="station-system-status">
            <MissionSystemProgress
              disabled={savingStatusKeys.includes(statusKey)}
              editable
              editableRoles={canSeeAll ? editableSystemStatusRoles(member) : ["ranger"]}
              onToggle={(status, checked) => onToggleStatus(station, status, checked)}
              pulseRoles={[member.specialty]}
              statuses={planetStatuses[statusKey] ?? []}
            />
          </div>
        )}
        <div className="station-actions">
          {canCreateMission && (
            <button
              aria-label={t("stations.create_mission_from_portal", { portal: station.portal })}
              className={`member-icon-action create-station-mission${
                member.specialty === "ranger" ? "" : " station-create-mission-pulse"
              }`}
              data-tooltip={t("stations.create_mission_from_station")}
              onClick={() => onCreateMission(station)}
              type="button"
            >
              <CirclePlus size={14} />
            </button>
          )}
          {!canCreateMission &&
            !canSeeAll &&
            (member.specialty === "explorer" || member.specialty === "builder" || member.specialty === "ranger") &&
            station.hasMissions &&
            !station.canOpenOwnSpecialtyMission && (
              <span
                aria-label={t("stations.mission_in_progress", {
                  specialty: t(
                    member.specialty === "explorer"
                      ? "common.explorers"
                      : member.specialty === "builder"
                        ? "common.builders"
                        : "common.explorers_and_builders",
                  ),
                })}
                className="member-icon-action create-station-mission station-mission-disabled"
                data-tooltip={t("stations.mission_in_progress", {
                  specialty: t(
                    member.specialty === "explorer"
                      ? "common.explorers"
                      : member.specialty === "builder"
                        ? "common.builders"
                        : "common.explorers_and_builders",
                  ),
                })}
                role="img"
              >
                <CirclePlus size={14} />
              </span>
            )}
          {showAssociatedMissionsLink && station.hasMissions && station.specialtyMissionId ? (
            canSeeAll || station.canOpenOwnSpecialtyMission ? (
              <Link
                aria-label={t("planet.open_missions_for_planet_portal", { portal: station.portal })}
                className="member-icon-action station-missions-link"
                data-tooltip={t("missions.open_associated_missions")}
                href={`${missionDetailHref(station.specialtyMissionId, "stations")}&source=station-card`}
              >
                <Crosshair size={14} />
              </Link>
            ) : null
          ) : null}
          {showDetailLink && (
            <Link
              aria-label={t("details.open_station")}
              className="member-icon-action station-detail-link"
              data-tooltip={t("details.open_station")}
              href={stationDetailHref(station)}
            >
              <ExternalLink size={14} />
            </Link>
          )}
          {canEditStation && (
            <button
              aria-label={t("stations.edit_station_portal", { portal: station.portal })}
              className="member-icon-action station-edit-action"
              data-tooltip={t("stations.edit_station")}
              onClick={() => onEdit(station)}
              type="button"
            >
              <Pencil size={14} />
            </button>
          )}
          {station.note && (
            <button
              aria-label={t("stations.view_notes_for_station", { station: stationDisplayName })}
              className="member-icon-action station-notes-action"
              data-tooltip={t("stations.view_station_notes")}
              onClick={() => onViewNote(station)}
              type="button"
            >
              <FileText size={14} />
            </button>
          )}
          {!station.hasMissions && (canSeeAll || station.ownerId === member.publicId) && (
            <button
              aria-label={t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", {
                portal: station.portal,
                galaxy: galaxyLabel(station.galaxy),
                owner: stationOwnerName(station),
              })}
              className="member-icon-action delete-member"
              data-tooltip={t("stations.delete_station")}
              onClick={() => onRemove(station)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
