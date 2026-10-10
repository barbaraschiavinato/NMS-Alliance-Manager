"use client";

import Image from "next/image";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { type MemberMessageContext } from "@/components/modals/member-card-dialog";
import type { AllianceMember } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";
import { missionSpecialties, type MissionSpecialty } from "@/lib/missions";
import { isMissionSystemStatus, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";

export type CachedPlanet = Readonly<{ galaxy: number; response: Record<string, unknown> }>;
export type StationMissionStatus = "none" | "in_progress" | "completed";
export type StationFilter = "all" | "pending" | "in_progress" | "completed" | "notes";
export type StationEntry = Readonly<{
  portal: string;
  galaxy: number;
  ownerId: string;
  ownerName?: string;
  ownerNmsName?: string;
  ownerImage?: string;
  createdByMemberId?: string;
  createdAt?: string;
  name?: string;
  note?: string;
  planet: CachedPlanet | null;
  hasMissions: boolean;
  canOpenOwnSpecialtyMission: boolean;
  missionStatus: StationMissionStatus;
  availableSpecialties: MissionSpecialty[];
}>;
export type StationMissionSeed = Readonly<{ portal: string; galaxy: number; title: string; ownerMemberId: string }>;

export function GalaxyLabel({ galaxy }: Readonly<{ galaxy: number }>) {
  const { t } = useLocale();
  const foreign = galaxy !== 0;
  return <span className={foreign ? "mission-galaxy-alert" : undefined} data-tooltip={foreign ? t("missions.galaxy_portals_warning") : undefined} tabIndex={foreign ? 0 : undefined}>{foreign && <AlertTriangle size={9} />}{galaxyLabel(galaxy)}</span>;
}

export function canCreateMissionFromStation(station: StationEntry, member: AllianceMember, canManage: boolean) {
  if (canManage) return station.availableSpecialties.length > 0;
  if (member.specialty === "explorer" || member.specialty === "builder") {
    return station.availableSpecialties.some((specialty) => specialty === member.specialty);
  }
  return member.specialty === "ranger" &&
    station.ownerId === member.publicId &&
    station.availableSpecialties.some((specialty) => ["explorer_builder", "explorer", "builder"].includes(specialty));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function cachedPlanetType(planet: CachedPlanet | null) {
  const title = cachedPlanetTitle(planet);
  if (title) return title;
  const lines = asRecord(planet?.response.lines);
  return planetWord(asRecord(lines?.band), "type") ?? "";
}

export function parseStations(value: unknown): StationEntry[] {
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
      ...(typeof station.createdAt === "string" ? { createdAt: station.createdAt } : {}),
      ...(typeof station.name === "string" ? { name: station.name } : {}),
      ...(typeof station.note === "string" ? { note: station.note } : {}),
      planet,
      hasMissions: station.hasMissions === true,
      canOpenOwnSpecialtyMission: station.canOpenOwnSpecialtyMission === true,
      missionStatus: station.missionStatus === "in_progress" || station.missionStatus === "completed"
        ? station.missionStatus
        : "none",
      availableSpecialties,
    }];
  });
}

export function parsePlanetSystemStatuses(value: unknown): PlanetSystemStatuses {
  const statuses = asRecord(value);
  if (!statuses) throw new Error("Invalid system status response.");
  return Object.fromEntries(Object.entries(statuses).map(([key, values]) => {
    if (!Array.isArray(values) || !values.every(isMissionSystemStatus)) {
      throw new Error("Invalid system status response.");
    }
    return [key, [...new Set(values)]];
  }));
}

export function stationOwnerName(station: StationEntry) {
  const profileName = station.ownerName?.trim();
  if (profileName && !profileName.includes("@")) return profileName;
  return "Former member";
}

export function StationOwnerCell({ station, onOpenProfile, ownerLabel }: Readonly<{
  station: StationEntry;
  onOpenProfile: (memberId: string) => void;
  ownerLabel: string;
}>) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = stationOwnerName(station);
  const initials = name.slice(0, 2).toUpperCase() || "—";

  return <div className="station-owner-card">
    <small>{ownerLabel}</small>
    <button aria-label={name} className="assignee-cell mission-member-link station-owner-link" data-tooltip={name} onClick={() => onOpenProfile(station.ownerId)} type="button">
      <span aria-hidden="true" className={`assignee-avatar ${station.ownerImage && !imageFailed ? "assignee-avatar-image" : ""}`}>
        {station.ownerImage && !imageFailed
          ? <Image alt="" height={21} onError={() => setImageFailed(true)} src={station.ownerImage} unoptimized width={21} />
          : initials}
      </span>
      <span className="assignee-name">{name}</span>
    </button>
  </div>;
}

export function planetWord(band: Record<string, unknown> | null, key: string) {
  const attribute = band ? asRecord(band[key]) : null;
  return typeof attribute?.word === "string" ? attribute.word : null;
}

export function cachedPlanetTitle(planet: CachedPlanet | null) {
  const lines = asRecord(planet?.response.lines);
  const headline = asRecord(lines?.headline);
  return typeof headline?.word === "string" ? headline.word : "";
}

export function cachedPlanetImageUrl(planet: CachedPlanet | null) {
  const pictures = asRecord(planet?.response.pictures);
  const disc = pictures?.disc;
  return typeof disc === "string" && disc.startsWith("/planets/")
    ? `https://nmsalmanac.com/api${disc}`
    : null;
}

export function CachedPlanetInfo({ planet, onOpen }: Readonly<{ planet: CachedPlanet; onOpen: () => void }>) {
  const { t, tv } = useLocale();
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
        <GalaxyLabel galaxy={planet.galaxy} /><strong>{title || t("planet.planet_data")}</strong>
      </button>
      <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{tv(value)}</dd></div>)}</dl>
    </div>
  );
}


export type StationCardProps = Readonly<{
  station: StationEntry;
  member: AllianceMember;
  canSeeAll: boolean;
  canCreateMissions: boolean;
  renderedAt: number;
  planetStatuses: PlanetSystemStatuses;
  planetStatusesLoaded: boolean;
  savingStatusKeys: string[];
  onToggleStatus: (station: StationEntry, status: MissionSystemStatus, checked: boolean) => void;
  onOpenStation: (station: StationEntry) => void;
  onOpenProfile: (target: { memberId: string; messageContext: MemberMessageContext }) => void;
  onCreateMission: (station: StationEntry) => void;
  onEdit: (station: StationEntry) => void;
  onRemove: (station: StationEntry) => void;
  onViewNote: (station: StationEntry) => void;
}>;

