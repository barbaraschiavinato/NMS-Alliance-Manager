"use client";

import Image from "next/image";
import Link from "next/link";
import { CirclePlus, Crosshair, FileText, Pencil, Trash2 } from "lucide-react";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { StationSystemCoreInfo } from "@/components/shared/station-system-core-info";
import { MissionSystemProgress } from "@/components/shared/mission-system-progress";
import { galaxyLabel } from "@/lib/galaxies";
import { editableSystemStatusRoles, planetSystemStatusKey } from "@/lib/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";
import { GalaxyLabel, canCreateMissionFromStation, cachedPlanetType, stationOwnerName, StationOwnerCell, cachedPlanetTitle, cachedPlanetImageUrl, CachedPlanetInfo } from "@/components/cards/station-card/parts";
import type { StationCardProps } from "@/components/cards/station-card/parts";

export function StationCardSimple({ station, member, canSeeAll, canCreateMissions, renderedAt, planetStatuses, planetStatusesLoaded, savingStatusKeys, onToggleStatus, onOpenStation, onOpenProfile, onCreateMission, onEdit, onRemove, onViewNote }: StationCardProps) {
  const { t } = useLocale();
              const planetImageUrl = cachedPlanetImageUrl(station.planet);
              const stationDisplayName = station.name || cachedPlanetType(station.planet) || cachedPlanetTitle(station.planet) || t("planet.unnamed_planet");
              const statusKey = planetSystemStatusKey(station.portal, station.galaxy);
              const createdTime = station.createdAt ? Date.parse(station.createdAt) : Number.NaN;
              const isNewStation = !station.hasMissions && Number.isFinite(createdTime) && renderedAt - createdTime < 7 * 24 * 60 * 60 * 1000;
              const newRibbon = isNewStation && <span className="station-new-ribbon-clip"><span className="station-new-ribbon">{t("stations.new_badge")}</span></span>;
              const canEditStation = canSeeAll ||
                (station.createdByMemberId ?? station.ownerId) === member.publicId;
              const canCreateMission = canCreateMissionFromStation(station, member, canCreateMissions);
              const stationOwner = <StationOwnerCell onOpenProfile={(memberId) => onOpenProfile({
                memberId,
                messageContext: {
                  type: "planet",
                  portal: station.portal,
                  galaxy: station.galaxy,
                  subjectLabel: station.name || cachedPlanetTitle(station.planet) || cachedPlanetType(station.planet),
                },
              })} ownerLabel={t("stations.station_owner")} station={station} />;
              return <li className={isNewStation ? "station-is-new" : undefined}>
                {newRibbon}
                {<button className={`station-card-title${planetImageUrl ? " station-card-title-with-image" : ""}`} onClick={() => onOpenStation(station)} type="button">
                  {planetImageUrl && <Image alt="" className="station-card-planet-image" height={112} src={planetImageUrl} unoptimized width={112} />}
                  <span className="station-card-title-copy">
                    <GalaxyLabel galaxy={station.galaxy} />
                    <strong>{stationDisplayName}</strong>
                    <StationSystemCoreInfo key={`${station.portal}:${station.galaxy}`} galaxy={station.galaxy} portal={station.portal} />
                  </span>
                </button>}
                <div className="station-card-owner">{stationOwner}</div>
                <div className="station-portal-code"><strong className="station-name">{stationDisplayName}</strong><GlyphStrip address={station.portal} /></div>
                <div className="station-planet-info-list">
                  {station.planet
                    ? <CachedPlanetInfo onOpen={() => onOpenStation(station)} planet={station.planet} />
                    : <p className="station-card-no-planet">{t("planet.no_almanac_data")}</p>}
                </div>
                <div className="station-card-footer">
                  {(canSeeAll || station.ownerId === member.publicId) && planetStatusesLoaded && <div className="station-system-status">
                    <MissionSystemProgress
                      disabled={savingStatusKeys.includes(statusKey)}
                      editable
                      editableRoles={canSeeAll ? editableSystemStatusRoles(member) : ["ranger"]}
                      onToggle={(status, checked) => onToggleStatus(station, status, checked)}
                      statuses={planetStatuses[statusKey] ?? []}
                    />
                  </div>}
                  <div className="station-actions">
                  {canCreateMission && <button aria-label={t("stations.create_mission_from_portal", { portal: station.portal })} className="member-icon-action create-station-mission" data-tooltip={t("stations.create_mission_from_station")} onClick={() => onCreateMission(station)} type="button"><CirclePlus size={14} /></button>}
                  {!canCreateMission && !canSeeAll && (member.specialty === "explorer" || member.specialty === "builder") && station.hasMissions && !station.canOpenOwnSpecialtyMission &&
                    <span aria-label={t("stations.mission_in_progress", { specialty: t(member.specialty === "explorer" ? "common.explorers" : "common.builders") })} className="member-icon-action create-station-mission station-mission-disabled" data-tooltip={t("stations.mission_in_progress", { specialty: t(member.specialty === "explorer" ? "common.explorers" : "common.builders") })} role="img"><CirclePlus size={14} /></span>}
                  {station.hasMissions
                    ? canSeeAll || station.canOpenOwnSpecialtyMission
                      ? <Link aria-label={t("planet.open_missions_for_planet_portal", { portal: station.portal })} className="member-icon-action station-missions-link" data-tooltip={t("missions.open_associated_missions")} href={`/missions?search=${encodeURIComponent(station.portal)}`}><Crosshair size={14} /></Link>
                      : <span className="station-mission-lock">{t("missions.associated_mission")}</span>
                    : (canSeeAll || station.ownerId === member.publicId) && <button aria-label={t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", { portal: station.portal, galaxy: galaxyLabel(station.galaxy), owner: stationOwnerName(station) })} className="member-icon-action delete-member" data-tooltip={t("stations.delete_station")} onClick={() => onRemove(station)} type="button"><Trash2 size={14} /></button>}
                  {canEditStation && <button aria-label={t("stations.edit_station_portal", { portal: station.portal })} className="member-icon-action" data-tooltip={t("stations.edit_station")} onClick={() => onEdit(station)} type="button"><Pencil size={14} /></button>}
                  {station.note && <button aria-label={t("stations.view_notes_for_station", { station: stationDisplayName })} className="member-icon-action station-notes-action" data-tooltip={t("stations.view_station_notes")} onClick={() => onViewNote(station)} type="button"><FileText size={14} /></button>}
                  </div>
                </div>
              </li>;
}
