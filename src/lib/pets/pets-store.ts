import { randomUUID } from "node:crypto";
import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import { memoizedRead } from "@/lib/storage/request-memo";
import { reassignOwnedItems } from "@/lib/members/owned-items";
import { normalizeStoredPet, type Pet, type PetInput } from "@/lib/pets/pets";

export function readPets(): Promise<Pet[]> {
  return memoizedRead("pets", readPetsFromStore);
}

async function readPetsFromStore(): Promise<Pet[]> {
  const raw = await readJsonDocument("pets");
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const pet = normalizeStoredPet(entry);
    if (!pet || seen.has(pet.id)) return [];
    seen.add(pet.id);
    return [pet];
  });
}

function writePets(pets: readonly Pet[]): Promise<void> {
  return writeJsonDocument("pets", pets);
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
  const reassigned = reassignOwnedItems(await readPets(), fromMemberId, toMemberId);
  if (reassigned) await writePets(reassigned);
}
