import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { decodePortalAddress } from "@/lib/missions";
import { readAccessData } from "@/lib/access-store";

export type StationPortal = Readonly<{ portal: string; galaxy: number; name?: string; note?: string; createdByMemberId?: string }>;
export type OwnedStationPortal = StationPortal & Readonly<{ ownerId: string }>;
type StationIndex = Record<string, StationPortal[]>;
type NormalizedStation = StationPortal & Readonly<{ createdByEmail?: string }>;

const blobPath = "alliance-manager/stations.json";
const localPath = path.join(process.cwd(), "data", "stations.json");

function normalizeStationEntries(entries: unknown[]): NormalizedStation[] {
  const stations = entries.flatMap((entry) => {
    const station = typeof entry === "string" ? { portal: entry, galaxy: 0 } : entry;
    if (!station || typeof station !== "object" || !("portal" in station) || typeof station.portal !== "string") return [];
    const galaxy = "galaxy" in station && typeof station.galaxy === "number" ? station.galaxy : 0;
    if (!Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255 || decodePortalAddress(station.portal)?.errors.length !== 0) return [];
    const name = "name" in station && typeof station.name === "string" ? station.name.trim().slice(0, 80) : "";
    const note = "note" in station && typeof station.note === "string" ? station.note.trim().slice(0, 1000) : "";
    const createdByMemberId = "createdByMemberId" in station && typeof station.createdByMemberId === "string"
      ? station.createdByMemberId.trim()
      : "";
    const createdByEmail = "createdByEmail" in station && typeof station.createdByEmail === "string"
      ? station.createdByEmail.trim().toLowerCase()
      : "";
    return [{
      portal: station.portal.toUpperCase(),
      galaxy,
      ...(name ? { name } : {}),
      ...(note ? { note } : {}),
      ...(createdByMemberId ? { createdByMemberId } : {}),
      ...(createdByEmail ? { createdByEmail } : {}),
    }];
  });
  return [...new Map(stations.map((station) => [`${station.portal}:${station.galaxy}`, station])).values()];
}

function normalizeStationIndex(value: unknown, members: Awaited<ReturnType<typeof readAccessData>>["members"]): { index: StationIndex; migrated: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { index: {}, migrated: false };

  const index: StationIndex = {};
  let migrated = false;
  for (const [storedOwner, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const owner = members.find((candidate) =>
      candidate.publicId === storedOwner || candidate.email.toLowerCase() === storedOwner.trim().toLowerCase(),
    );
    if (!owner) throw new Error("Stored station archive owner could not be resolved to a member.");
    if (storedOwner !== owner.publicId) migrated = true;
    const stations = normalizeStationEntries(entries).map((station) => {
      const creator = station.createdByEmail
        ? members.find((candidate) => candidate.email.toLowerCase() === station.createdByEmail?.toLowerCase())
        : undefined;
      if (station.createdByEmail) migrated = true;
      const legacyCreatorMemberId = station.createdByMemberId ?? creator?.publicId;
      return {
        portal: station.portal,
        galaxy: station.galaxy,
        ...(station.name ? { name: station.name } : {}),
        ...(station.note ? { note: station.note } : {}),
        ...(legacyCreatorMemberId ? { createdByMemberId: legacyCreatorMemberId } : {}),
      };
    });
    index[owner.publicId] = [...new Map(
      [...(index[owner.publicId] ?? []), ...stations]
        .map((station) => [`${station.portal}:${station.galaxy}`, station] as const),
    ).values()];
  }
  return { index, migrated };
}

async function readStationIndex(): Promise<StationIndex> {
  const access = await readAccessData();
  const blobAuthOptions = getBlobAuthOptions();
  let raw: unknown;
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return {};
    raw = JSON.parse(await new Response(blob.stream).text());
  } else {
    try {
      raw = JSON.parse(await readFile(localPath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
  const { index, migrated } = normalizeStationIndex(raw, access.members);
  if (migrated) await writeStationIndex(index);
  return index;
}

async function writeStationIndex(index: StationIndex): Promise<void> {
  const json = `${JSON.stringify(index, null, 2)}\n`;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(blobPath, json, {
      access: "private",
      ...blobAuthOptions,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, json, "utf8");
}

export async function readStationPortals(memberId: string): Promise<StationPortal[]> {
  const index = await readStationIndex();
  return index[memberId.trim()] ?? [];
}

export async function readAllStationPortals(): Promise<OwnedStationPortal[]> {
  const index = await readStationIndex();
  return Object.entries(index).flatMap(([ownerId, stations]) => stations.map((station) => ({ ...station, ownerId })));
}

export async function addStationPortal(
  memberId: string,
  portal: string,
  galaxy: number,
  name?: string,
  createdByMemberId?: string,
  note?: string,
): Promise<StationPortal[]> {
  const index = await readStationIndex();
  const owner = memberId.trim();
  const stations = index[owner] ?? [];
  if (!stations.some((station) => station.portal === portal && station.galaxy === galaxy)) {
    const normalizedName = name?.trim().slice(0, 80);
    const normalizedNote = note?.trim().slice(0, 1000);
    const creator = createdByMemberId?.trim();
    stations.push({
      portal,
      galaxy,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(normalizedNote ? { note: normalizedNote } : {}),
      ...(creator ? { createdByMemberId: creator } : {}),
    });
  }
  index[owner] = stations;
  await writeStationIndex(index);
  return stations;
}

export async function removeStationPortal(memberId: string, portal: string, galaxy: number): Promise<StationPortal[]> {
  const index = await readStationIndex();
  const owner = memberId.trim();
  const stations = (index[owner] ?? []).filter((station) => station.portal !== portal || station.galaxy !== galaxy);
  if (stations.length > 0) index[owner] = stations;
  else delete index[owner];
  await writeStationIndex(index);
  return stations;
}

export async function updateStationPortal(
  currentOwnerId: string,
  currentPortal: string,
  currentGalaxy: number,
  ownerId: string,
  portal: string,
  galaxy: number,
  name?: string,
  note?: string,
): Promise<boolean> {
  const index = await readStationIndex();
  const currentOwner = currentOwnerId.trim();
  const owner = ownerId.trim();
  const currentStations = index[currentOwner] ?? [];
  const currentIndex = currentStations.findIndex((station) =>
    station.portal === currentPortal && station.galaxy === currentGalaxy,
  );
  if (currentIndex === -1) return false;
  const existingStation = currentStations[currentIndex];

  const destinationStations = index[owner] ?? [];
  if (destinationStations.some((station) =>
    station.portal === portal &&
    station.galaxy === galaxy &&
    !(owner === currentOwner && station.portal === currentPortal && station.galaxy === currentGalaxy),
  )) return false;

  currentStations.splice(currentIndex, 1);
  if (currentStations.length > 0) index[currentOwner] = currentStations;
  else delete index[currentOwner];

  const normalizedName = name?.trim().slice(0, 80);
  const normalizedNote = note?.trim().slice(0, 1000);
  const updatedStation = {
    portal,
    galaxy,
    ...(normalizedName ? { name: normalizedName } : {}),
    ...(normalizedNote ? { note: normalizedNote } : {}),
    ...(existingStation.createdByMemberId ? { createdByMemberId: existingStation.createdByMemberId } : {}),
  };
  index[owner] = [...(index[owner] ?? []), updatedStation];
  await writeStationIndex(index);
  return true;
}
export async function reassignStationOwner(fromMemberId: string, toMemberId: string): Promise<void> {
  const index = await readStationIndex();
  const moved = index[fromMemberId];
  if (!moved) return;
  const merged = new Map<string, StationPortal>((index[toMemberId] ?? []).map((station) => [`${station.portal}:${station.galaxy}`, station] as const));
  for (const station of moved) {
    const key = `${station.portal}:${station.galaxy}`;
    const next = station.createdByMemberId === fromMemberId ? { ...station, createdByMemberId: toMemberId } : station;
    if (!merged.has(key)) merged.set(key, next);
  }
  delete index[fromMemberId];
  index[toMemberId] = [...merged.values()];
  for (const [owner, stations] of Object.entries(index)) {
    index[owner] = stations.map((station) => station.createdByMemberId === fromMemberId ? { ...station, createdByMemberId: toMemberId } : station);
  }
  await writeStationIndex(index);
}
