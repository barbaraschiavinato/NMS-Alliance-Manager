import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { decodePortalAddress } from "@/lib/missions";
import { readAccessData } from "@/lib/access-store";

export type StationPortal = Readonly<{ portal: string; galaxy: number; name?: string; note?: string; createdByMemberId?: string; createdAt?: string }>;
export type OwnedStationPortal = StationPortal & Readonly<{ ownerId: string }>;
type StationIndex = Record<string, StationPortal[]>;
type StationList = OwnedStationPortal[];
type NormalizedStation = StationPortal & Readonly<{ createdByEmail?: string }>;

const legacyBlobPath = "alliance-manager/stations.json";
const legacyLocalPath = path.join(process.cwd(), "data", "stations.json");
const blobPath = "alliance-manager/stations-v2.json";
const localPath = path.join(process.cwd(), "data", "stations-v2.json");

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
    const createdAt = "createdAt" in station && typeof station.createdAt === "string" && Number.isFinite(Date.parse(station.createdAt))
      ? station.createdAt
      : "";
    return [{
      portal: station.portal.toUpperCase(),
      galaxy,
      ...(name ? { name } : {}),
      ...(note ? { note } : {}),
      ...(createdByMemberId ? { createdByMemberId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(createdByEmail ? { createdByEmail } : {}),
    }];
  });
  return [...new Map(stations.map((station) => [`${station.portal}:${station.galaxy}`, station])).values()];
}

function normalizeStationIndex(value: unknown, members: Awaited<ReturnType<typeof readAccessData>>["members"]): { index: StationIndex; migrated: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { index: {}, migrated: false };

  const index: StationIndex = {};
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  let migrated = false;
  for (const [storedOwner, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const owner = members.find((candidate) =>
      candidate.publicId === storedOwner || candidate.email.toLowerCase() === storedOwner.trim().toLowerCase(),
    );
    const fallbackOwner = owner ?? members.find((candidate) => candidate.email.toLowerCase() === adminEmail);
    const ownerKey = fallbackOwner?.publicId ?? storedOwner;
    if (fallbackOwner && storedOwner !== fallbackOwner.publicId) migrated = true;
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
        ...(station.createdAt ? { createdAt: station.createdAt } : {}),
      };
    });
    index[ownerKey] = [...new Map(
      [...(index[ownerKey] ?? []), ...stations]
        .map((station) => [`${station.portal}:${station.galaxy}`, station] as const),
    ).values()];
  }
  return { index, migrated };
}

async function readJson(blobName: string, filePath: string): Promise<unknown | undefined> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobName, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return undefined;
    return JSON.parse(await new Response(blob.stream).text());
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function flattenIndex(index: StationIndex): StationList {
  return Object.entries(index).flatMap(([ownerId, stations]) => stations.map((station) => ({ ...station, ownerId })));
}

function normalizeStationList(value: unknown, fallbackOwnerId?: string): StationList {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const storedOwnerId = "ownerId" in entry && typeof entry.ownerId === "string" ? entry.ownerId.trim() : "";
    const ownerId = storedOwnerId || fallbackOwnerId;
    if (!ownerId) return [];
    const [station] = normalizeStationEntries([entry]);
    if (!station) return [];
    const key = `${station.portal}:${station.galaxy}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      portal: station.portal,
      galaxy: station.galaxy,
      ownerId,
      ...(station.name ? { name: station.name } : {}),
      ...(station.note ? { note: station.note } : {}),
      ...(station.createdByMemberId ? { createdByMemberId: station.createdByMemberId } : {}),
      ...(station.createdAt ? { createdAt: station.createdAt } : {}),
    }];
  });
}

// Lazy migration: if the flat list doesn't exist yet, build it from the legacy per-owner file (left untouched as backup).
async function readStationList(): Promise<StationList> {
  const current = await readJson(blobPath, localPath);
  const access = await readAccessData();
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  const fallbackOwnerId = access.members.find((candidate) => candidate.email.toLowerCase() === adminEmail)?.publicId;
  if (current !== undefined) return normalizeStationList(current, fallbackOwnerId);
  const legacy = await readJson(legacyBlobPath, legacyLocalPath);
  if (legacy === undefined) return [];
  const list = normalizeStationList(flattenIndex(normalizeStationIndex(legacy, access.members).index), fallbackOwnerId);
  await writeStationList(list);
  return list;
}

async function writeStationList(list: StationList): Promise<void> {
  const json = `${JSON.stringify(list, null, 2)}\n`;
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

function stripOwner(station: OwnedStationPortal): StationPortal {
  const { ownerId, ...rest } = station;
  void ownerId;
  return rest;
}

export async function readStationPortals(memberId: string): Promise<StationPortal[]> {
  const owner = memberId.trim();
  return (await readStationList()).filter((station) => station.ownerId === owner).map(stripOwner);
}

export async function readAllStationPortals(): Promise<OwnedStationPortal[]> {
  return readStationList();
}

export async function addStationPortal(
  memberId: string,
  portal: string,
  galaxy: number,
  name?: string,
  createdByMemberId?: string,
  note?: string,
): Promise<StationPortal[]> {
  const list = await readStationList();
  const owner = memberId.trim();
  if (!list.some((station) => station.portal === portal && station.galaxy === galaxy)) {
    const normalizedName = name?.trim().slice(0, 80);
    const normalizedNote = note?.trim().slice(0, 1000);
    const creator = createdByMemberId?.trim();
    list.push({
      portal,
      galaxy,
      ownerId: owner,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(normalizedNote ? { note: normalizedNote } : {}),
      ...(creator ? { createdByMemberId: creator } : {}),
      createdAt: new Date().toISOString(),
    });
    await writeStationList(list);
  }
  return list.filter((station) => station.ownerId === owner).map(stripOwner);
}

export async function removeStationPortal(memberId: string, portal: string, galaxy: number): Promise<StationPortal[]> {
  const owner = memberId.trim();
  const list = (await readStationList()).filter((station) =>
    station.ownerId !== owner || station.portal !== portal || station.galaxy !== galaxy,
  );
  await writeStationList(list);
  return list.filter((station) => station.ownerId === owner).map(stripOwner);
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
  const list = await readStationList();
  const currentOwner = currentOwnerId.trim();
  const owner = ownerId.trim();
  const position = list.findIndex((station) =>
    station.ownerId === currentOwner && station.portal === currentPortal && station.galaxy === currentGalaxy,
  );
  if (position === -1) return false;
  const existingStation = list[position];

  if (list.some((station, index) =>
    index !== position && station.portal === portal && station.galaxy === galaxy,
  )) return false;

  const normalizedName = name?.trim().slice(0, 80);
  const normalizedNote = note?.trim().slice(0, 1000);
  list[position] = {
    portal,
    galaxy,
    ownerId: owner,
    ...(normalizedName ? { name: normalizedName } : {}),
    ...(normalizedNote ? { note: normalizedNote } : {}),
    ...(existingStation.createdByMemberId ? { createdByMemberId: existingStation.createdByMemberId } : {}),
    ...(existingStation.createdAt ? { createdAt: existingStation.createdAt } : {}),
  };
  await writeStationList(list);
  return true;
}

export async function reassignStationOwner(fromMemberId: string, toMemberId: string): Promise<void> {
  const list = await readStationList();
  if (!list.some((station) => station.ownerId === fromMemberId || station.createdByMemberId === fromMemberId)) return;
  await writeStationList(list.map((station) => ({
    ...station,
    ownerId: station.ownerId === fromMemberId ? toMemberId : station.ownerId,
    ...(station.createdByMemberId === fromMemberId ? { createdByMemberId: toMemberId } : {}),
  })));
}
