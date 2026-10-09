import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readAlmanacResponses } from "@/lib/almanac-store";
import { galaxyLabel } from "@/lib/galaxies";
import type { Mission, MissionSpecialty } from "@/lib/missions";
import { isEmailAddress } from "@/lib/member-types";
import { readMissions } from "@/lib/store";
import { readAllStationPortals } from "@/lib/stations-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workbookContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function escapeXml(value: string) {
  const xmlSafeValue = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 9 || codePoint === 10 || codePoint === 13 ||
      (codePoint >= 32 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      ? character
      : "";
  }).join("");
  return xmlSafeValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetColumn(index: number) {
  let number = index + 1;
  let column = "";
  while (number > 0) {
    number -= 1;
    column = String.fromCharCode(65 + number % 26) + column;
    number = Math.floor(number / 26);
  }
  return column;
}

function buildWorkbook(headers: string[], rows: string[][]) {
  const allRows = [headers, ...rows];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      `<c r="${spreadsheetColumn(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
    ).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const widths = [28, 18, 24, 28, 24, 32, 18, 18, 24, 18, 24, 24, 24, 60, 24, 18, 16, 34, 24]
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const xml = (content: string) => new TextEncoder().encode(content);

  return zipSync({
    "[Content_Types].xml": xml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": xml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": xml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stazioni" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": xml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

function memberDisplayName(member: Awaited<ReturnType<typeof readAccessData>>["members"][number] | undefined) {
  if (!member) return "Ex membro";
  return [member.nmsName, member.name].find((name) => name?.trim() && !isEmailAddress(name)) ?? "Ex membro";
}

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "stations.error_access_required" }, { status: 401 });
  if (!hasRole(member, "moderator")) {
    return NextResponse.json({ error: "stations.error_moderator_permission_required" }, { status: 403 });
  }

  try {
    const stations = await readAllStationPortals();
    const [accessData, almanacByPortal, missions] = await Promise.all([
      readAccessData(),
      readAlmanacResponses(stations.map((station) => station.portal)),
      readMissions(),
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
      "Proprietario",
      "Nome NMS proprietario",
      "Scopritore",
      "Note dello scopritore",
      "Data registrazione",
      "Missioni presenti",
      "Numero missioni",
      "Tipo missione",
      "Stato missioni",
    ];
    const rows = stations.map((station) => {
      const owner = accessData.members.find((candidate) => candidate.publicId === station.ownerId);
      const discoverer = accessData.members.find((candidate) => candidate.publicId === station.createdByMemberId);
      const planet = almanacByPortal[station.portal]?.find((entry) => entry.galaxy === station.galaxy)?.response;
      const stationMissions = missionsByStation.get(`${station.portal}:${station.galaxy}`) ?? [];
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
        memberDisplayName(discoverer),
        station.note ?? "",
        station.createdAt ?? "",
        stationMissions.length > 0 ? "Sì" : "No",
        String(stationMissions.length),
        uniqueLabels(stationMissions.map((mission) => mission.targetSpecialty), missionSpecialtyLabels),
        uniqueLabels(stationMissions.map((mission) => mission.status), missionStatusLabels),
      ];
    });
    const file = buildWorkbook(headers, rows);
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
    return NextResponse.json({ error: "stations.error_unable_to_export_stations" }, { status: 503 });
  }
}
