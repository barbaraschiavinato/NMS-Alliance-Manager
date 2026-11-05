import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { localDataPath } from "@/lib/storage/local-data-path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { normalizeStoredPet, type Pet, type PetInput } from "@/lib/pets/pets";

const blobPath = "alliance-manager/pets.json";
const localPath = () => localDataPath("pets.json");

export async function readPets(): Promise<Pet[]> {
  let raw: unknown;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return [];
    raw = JSON.parse(await new Response(blob.stream).text());
  } else {
    try {
      raw = JSON.parse(await readFile(localPath(), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const pet = normalizeStoredPet(entry);
    if (!pet || seen.has(pet.id)) return [];
    seen.add(pet.id);
    return [pet];
  });
}

async function writePets(pets: readonly Pet[]): Promise<void> {
  const json = `${JSON.stringify(pets, null, 2)}\n`;
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
  const filePath = localPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, json, "utf8");
}

function petFields(input: PetInput) {
  return {
    name: input.name,
    petType: input.petType,
    activity: input.activity,
    habitat: input.habitat,
    rarity: input.rarity,
    eggTradeAvailable: input.eggTradeAvailable,
    classes: { ...input.classes },
    portal: input.portal,
    galaxy: input.galaxy,
    planetName: input.planetName,
    ...(input.coordinates ? { coordinates: input.coordinates } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

export async function addPet(
  input: PetInput,
  ownerId: Pet["ownerId"],
  createdByMemberId: string,
  imagePath?: string,
): Promise<Pet> {
  const pets = await readPets();
  const pet: Pet = {
    id: randomUUID(),
    ...petFields(input),
    ...(imagePath ? { imagePath } : {}),
    ownerId,
    createdByMemberId,
    createdAt: new Date().toISOString(),
  };
  await writePets([...pets, pet]);
  return pet;
}

// `imagePath` undefined keeps the stored image, null removes it, a string replaces it.
export async function updatePet(
  id: string,
  input: PetInput,
  ownerId: Pet["ownerId"],
  imagePath?: string | null,
): Promise<Pet | null> {
  const pets = await readPets();
  const current = pets.find((pet) => pet.id === id);
  if (!current) return null;
  const nextImagePath = imagePath === undefined ? current.imagePath : (imagePath ?? undefined);
  const updated: Pet = {
    id: current.id,
    ...petFields(input),
    ...(nextImagePath ? { imagePath: nextImagePath } : {}),
    ownerId,
    ...(current.createdByMemberId ? { createdByMemberId: current.createdByMemberId } : {}),
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writePets(pets.map((pet) => (pet.id === id ? updated : pet)));
  return updated;
}

export async function removePet(id: string): Promise<Pet | null> {
  const pets = await readPets();
  const removed = pets.find((pet) => pet.id === id);
  if (!removed) return null;
  await writePets(pets.filter((pet) => pet.id !== id));
  return removed;
}

export async function reassignPetOwner(fromMemberId: string, toMemberId: string): Promise<void> {
  const pets = await readPets();
  if (!pets.some((pet) => pet.ownerId === fromMemberId || pet.createdByMemberId === fromMemberId)) return;
  await writePets(
    pets.map((pet) => ({
      ...pet,
      ownerId: pet.ownerId === fromMemberId ? toMemberId : pet.ownerId,
      ...(pet.createdByMemberId === fromMemberId ? { createdByMemberId: toMemberId } : {}),
    })),
  );
}
