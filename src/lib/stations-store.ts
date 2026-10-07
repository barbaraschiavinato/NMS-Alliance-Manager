import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { decodePortalAddress } from "@/lib/missions";

export type StationPortal = Readonly<{ portal: string; galaxy: number; name?: string; note?: string; createdByEmail?: string }>;
export type OwnedStationPortal = StationPortal & Readonly<{ owner: string }>;
type StationIndex = Record<string, StationPortal[]>;

const blobPath = "alliance-manager/stations.json";
const localPath = path.join(process.cwd(), "data", "stations.json");

function normalizeStationIndex(value: unknown): StationIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const index: StationIndex = {};
  for (const [email, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const stations = entries.flatMap((entry) => {
      const station = typeof entry === "string" ? { portal: entry, galaxy: 0 } : entry;
      if (!station || typeof station !== "object" || !("portal" in station) || typeof station.portal !== "string") return [];
      const galaxy = "galaxy" in station && typeof station.galaxy === "number" ? station.galaxy : 0;
      if (!Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255 || decodePortalAddress(station.portal)?.errors.length !== 0) return [];
      const name = "name" in station && typeof station.name === "string" ? station.name.trim().slice(0, 80) : "";
      const note = "note" in station && typeof station.note === "string" ? station.note.trim().slice(0, 1000) : "";
      const createdByEmail = "createdByEmail" in station && typeof station.createdByEmail === "string"
        ? station.createdByEmail.trim().toLowerCase()
        : "";
      return [{
        portal: station.portal.toUpperCase(),
        galaxy,
        ...(name ? { name } : {}),
        ...(note ? { note } : {}),
        ...(createdByEmail ? { createdByEmail } : {}),
      }];
    });
    index[email.trim().toLowerCase()] = [...new Map(stations.map((station) => [`${station.portal}:${station.galaxy}`, station])).values()];
  }
  return index;
}

async function readStationIndex(): Promise<StationIndex> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return {};
    return normalizeStationIndex(JSON.parse(await new Response(blob.stream).text()));
  }

  try {
    return normalizeStationIndex(JSON.parse(await readFile(localPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
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

export async function readStationPortals(email: string): Promise<StationPortal[]> {
  const index = await readStationIndex();
  return index[email.trim().toLowerCase()] ?? [];
}

export async function readAllStationPortals(): Promise<OwnedStationPortal[]> {
  const index = await readStationIndex();
  return Object.entries(index).flatMap(([owner, stations]) => stations.map((station) => ({ ...station, owner })));
}

export async function addStationPortal(
  email: string,
  portal: string,
  galaxy: number,
  name?: string,
  createdByEmail?: string,
  note?: string,
): Promise<StationPortal[]> {
  const index = await readStationIndex();
  const owner = email.trim().toLowerCase();
  const stations = index[owner] ?? [];
  if (!stations.some((station) => station.portal === portal && station.galaxy === galaxy)) {
    const normalizedName = name?.trim().slice(0, 80);
    const normalizedNote = note?.trim().slice(0, 1000);
    const creator = createdByEmail?.trim().toLowerCase();
    stations.push({
      portal,
      galaxy,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(normalizedNote ? { note: normalizedNote } : {}),
      ...(creator ? { createdByEmail: creator } : {}),
    });
  }
  index[owner] = stations;
  await writeStationIndex(index);
  return stations;
}

export async function removeStationPortal(email: string, portal: string, galaxy: number): Promise<StationPortal[]> {
  const index = await readStationIndex();
  const owner = email.trim().toLowerCase();
  const stations = (index[owner] ?? []).filter((station) => station.portal !== portal || station.galaxy !== galaxy);
  if (stations.length > 0) index[owner] = stations;
  else delete index[owner];
  await writeStationIndex(index);
  return stations;
}

export async function updateStationPortal(
  currentOwnerEmail: string,
  currentPortal: string,
  currentGalaxy: number,
  ownerEmail: string,
  portal: string,
  galaxy: number,
  name?: string,
  note?: string,
): Promise<boolean> {
  const index = await readStationIndex();
  const currentOwner = currentOwnerEmail.trim().toLowerCase();
  const owner = ownerEmail.trim().toLowerCase();
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
    ...(existingStation.createdByEmail ? { createdByEmail: existingStation.createdByEmail } : {}),
  };
  index[owner] = [...(index[owner] ?? []), updatedStation];
  await writeStationIndex(index);
  return true;
}