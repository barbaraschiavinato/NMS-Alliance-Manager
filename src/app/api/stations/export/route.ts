import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readAlmanacResponses } from "@/lib/almanac/almanac-store";
import { galaxyLabel } from "@/lib/planets/galaxies";
import type { Mission, MissionSpecialty } from "@/lib/missions/missions";
import { isEmailAddress } from "@/lib/members/member-types";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";
import {
  systemStatusCoveredBy,
  planetSystemStatusKey,
  type MissionSystemStatus,
} from "@/lib/planets/planet-system-status";
import { readPlanetSystemStatuses } from "@/lib/planets/planet-system-status-store";
import { buildWorkbook, workbookContentType } from "@/lib/utils/xlsx-workbook";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, forbidden } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missionSpecialtyLabels: Record<MissionSpecialty, string> = {
  all: "Tutte",
  explorer_builder: "Esploratori e Costruttori",
  builder: "Costruttore",
  ranger: "Ranger",
  explorer: "Esploratore",
  other: "Altro",
};
const missionStatusLabels = {
  pending: "In attesa",
  in_progress: "In corso",
  completed: "Completata",
} satisfies Record<Mission["status"], string>;
const stationTaskStatuses = [
  "station_claimed",
  "system_scanned",
  "mapped",
  "planets_classified",
  "data_uploaded",
  "buildings_built",
  "bases_uploaded",
  "renamed",
  "system_data_uploaded",
] as const satisfies readonly MissionSystemStatus[];
const stationTaskLabels = {
  station_claimed: "Stazione riscattata",
  system_scanned: "Sistema scansionato (Ranger)",
  mapped: "Sistema scansionato",
  planets_classified: "Sistema esplorato",
  data_uploaded: "Dati caricati",
  buildings_built: "Edifici costruiti",
  bases_uploaded: "Basi caricate",
  renamed: "Sistema rinominato",
  system_data_uploaded: "Dati sistema caricati",
} satisfies Record<(typeof stationTaskStatuses)[number], string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function planetWord(response: Record<string, unknown> | undefined, key: string) {
  const lines = asRecord(response?.lines);
  const band = asRecord(lines?.band);
  const value = asRecord(band?.[key])?.word;
  return typeof value === "string" ? value : "";
}

function planetTitle(response: Record<string, unknown> | undefined) {
  const lines = asRecord(response?.lines);
  const headlineWord = asRecord(lines?.headline)?.word;
  return typeof headlineWord === "string" ? headlineWord : planetWord(response, "type");
}

function uniqueLabels<T extends string>(items: readonly T[], labels: Readonly<Record<T, string>>) {
  return [...new Set(items)].map((item) => labels[item]).join(", ");
}

function memberDisplayName(member: Awaited<ReturnType<typeof readAccessData>>["members"][number] | undefined) {
  if (!member) return "Ex membro";
  return [member.nmsName, member.name].find((name) => name?.trim() && !isEmailAddress(name)) ?? "Ex membro";
}

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return apiError("stations.error_access_required", 401);
  if (!hasRole(member, "moderator")) {
    return forbidden("stations.error_moderator_permission_required");
  }

  try {
    const stations = await readAllStationPortals();
    const [accessData, almanacByPortal, missions, systemStatusesByKey] = await Promise.all([
      readAccessData(),
      readAlmanacResponses(stations.map((station) => station.portal)),
      readMissions(),
      readPlanetSystemStatuses(),
    ]);
    const missionsByStation = new Map<string, Mission[]>();
    for (const mission of missions) {
      const key = `${mission.systemAddress.toUpperCase()}:${mission.galaxy}`;
      const stationMissions = missionsByStation.get(key);
      if (stationMissions) stationMissions.push(mission);
      else missionsByStation.set(key, [mission]);
    }
    const headers = [
      "Nome stazione",
      "Indirizzo portale",
      "Galassia",
      "Pianeta",
      "Tipo pianeta",
      "Meteo",
      "Acqua",
      "Stella",
      "Economia",
      "Razza",
      "Scopritore",
      "Nome NMS scopritore",
      "Registrata da",
      "Note dello scopritore",
      "Data registrazione",
      "Missioni presenti",
      "Numero missioni",
      "Tipo missione",
      "Stato missioni",
      ...stationTaskStatuses.map((status) => stationTaskLabels[status]),
    ];
    const rows = stations.map((station) => {
      const owner = accessData.members.find((candidate) => candidate.publicId === station.ownerId);
      const creator = accessData.members.find(
        (candidate) => candidate.publicId === (station.createdByMemberId ?? station.ownerId),
      );
      const planet = almanacByPortal[station.portal]?.find((entry) => entry.galaxy === station.galaxy)?.response;
      const stationMissions = missionsByStation.get(`${station.portal}:${station.galaxy}`) ?? [];
      const systemStatuses = systemStatusesByKey[planetSystemStatusKey(station.portal, station.galaxy)] ?? [];
      return [
        station.name ?? "",
        station.portal,
        galaxyLabel(station.galaxy),
        planetTitle(planet),
        planetWord(planet, "type"),
        planetWord(planet, "weather"),
        planetWord(planet, "water"),
        planetWord(planet, "star"),
        planetWord(planet, "economy"),
        planetWord(planet, "race"),
        memberDisplayName(owner),
        owner?.nmsName && !isEmailAddress(owner.nmsName) ? owner.nmsName : "",
        memberDisplayName(creator),
        station.note ?? "",
        station.createdAt ?? "",
        stationMissions.length > 0 ? "Sì" : "No",
        String(stationMissions.length),
        uniqueLabels(
          stationMissions.map((mission) => mission.targetSpecialty),
          missionSpecialtyLabels,
        ),
        uniqueLabels(
          stationMissions.map((mission) => mission.status),
          missionStatusLabels,
        ),
        ...stationTaskStatuses.map((status) =>
          systemStatuses.includes(status) || systemStatusCoveredBy(status, systemStatuses) !== null ? "Sì" : "No",
        ),
      ];
    });
    const file = buildWorkbook({
      sheetName: "Stazioni",
      headers,
      rows,
      widths: [28, 18, 24, 28, 24, 32, 18, 18, 24, 18, 24, 24, 24, 60, 24, 18, 16, 34, 24, 24, 18, 24, 18, 18, 18, 24],
    });
    const filename = `stazioni-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": workbookContentType,
      },
    });
  } catch (error) {
    console.error("Unable to export station portals", error);
    return apiError("stations.error_unable_to_export_stations", 503);
  }
});
