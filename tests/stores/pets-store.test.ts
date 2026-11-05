import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blobMock,
  blobWriteOptions,
  dataFileExists,
  readBlobJson,
  readDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";
import { writeDataFile } from "../helpers/members";
import type { PetInput } from "@/lib/pets/pets";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/pets/pets-store");
const now = "2026-05-01T12:00:00.000Z";
const input: PetInput = {
  name: "Fluffy",
  petType: "frost",
  activity: "unknown",
  habitat: "unknown",
  rarity: "unknown",
  eggTradeAvailable: false,
  classes: { combat: "S", agility: "A", health: "B" },
  portal: "0123456789AB",
  galaxy: 0,
  planetName: "Ruba",
  coordinates: "",
  note: "",
};
const imagePath = "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png";

beforeEach(() => {
  resetStores();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pets store (local filesystem)", () => {
  it("returns an empty list when the file is missing, without writing", async () => {
    const { readPets } = await load();
    expect(await readPets()).toEqual([]);
    expect(dataFileExists("pets.json")).toBe(false);
  });

  it("returns an empty list when the document is not an array", async () => {
    writeDataFile("pets.json", { pets: [] });
    const { readPets } = await load();
    expect(await readPets()).toEqual([]);
  });

  it("drops invalid and duplicate entries on read", async () => {
    const valid = { id: "a", ...input, ownerId: "o", createdAt: now };
    writeDataFile("pets.json", [valid, { ...valid }, { ...valid, id: "" }, "nope"]);
    const { readPets } = await load();
    expect(await readPets()).toHaveLength(1);
  });

  it("adds a pet with its owner and image, omitting empty optional fields", async () => {
    const { addPet, readPets } = await load();
    const pet = await addPet(input, "owner-1", "creator", imagePath);
    expect(pet).toMatchObject({
      name: "Fluffy",
      ownerId: "owner-1",
      createdByMemberId: "creator",
      imagePath,
      createdAt: now,
    });
    expect(pet.id).toBeTruthy();
    expect("coordinates" in pet).toBe(false);
    expect(await readPets()).toEqual([pet]);
    expect(readDataFile("pets.json")).toEqual([pet]);
  });

  it("updates the fields and keeps owner, creation date and image by default", async () => {
    const { addPet, updatePet } = await load();
    const pet = await addPet(input, "owner-1", "creator", imagePath);
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    const updated = await updatePet(pet.id, { ...input, name: "Rex", note: "hello" }, "owner-1");
    expect(updated).toMatchObject({
      id: pet.id,
      name: "Rex",
      note: "hello",
      ownerId: "owner-1",
      createdByMemberId: "creator",
      imagePath,
      createdAt: now,
      updatedAt: "2026-05-02T12:00:00.000Z",
    });
  });

  it("leaves the other pets untouched when updating one", async () => {
    const { addPet, updatePet, readPets } = await load();
    const first = await addPet(input, "owner-1", "creator");
    const second = await addPet({ ...input, name: "Rex" }, "owner-2", "creator");
    await updatePet(first.id, { ...input, name: "Fluffy II" }, "owner-1");
    expect((await readPets()).map((pet) => pet.name)).toEqual(["Fluffy II", "Rex"]);
    expect((await readPets())[1]).toEqual(second);
  });

  it("replaces or removes the image when asked", async () => {
    const { addPet, updatePet } = await load();
    const pet = await addPet(input, "owner-1", "creator", imagePath);
    const other = "alliance-manager/pets/aaaaaaaa-2222-4333-8444-555555555555.webp";
    expect((await updatePet(pet.id, input, "owner-1", other))?.imagePath).toBe(other);
    const removed = await updatePet(pet.id, input, "owner-1", null);
    expect(removed && "imagePath" in removed).toBe(false);
  });

  it("changes or clears the discoverer on update, keeping who created the pet", async () => {
    const { addPet, updatePet } = await load();
    const pet = await addPet(input, "owner-1", "creator");
    expect(await updatePet(pet.id, input, "owner-2")).toMatchObject({
      ownerId: "owner-2",
      createdByMemberId: "creator",
    });
    expect((await updatePet(pet.id, input, null))?.ownerId).toBeNull();
  });

  it("reassigns the discoverer and creator of a member's pets, leaving the others and the file untouched", async () => {
    const { addPet, readPets, reassignPetOwner } = await load();
    const own = await addPet(input, "old", "old");
    const created = await addPet({ ...input, name: "Rex" }, "someone", "old");
    const unassigned = await addPet({ ...input, name: "Ann" }, null, "someone");
    const other = await addPet({ ...input, name: "Zed" }, "other", "other");
    await reassignPetOwner("old", "new");
    expect(await readPets()).toEqual([
      { ...own, ownerId: "new", createdByMemberId: "new" },
      { ...created, createdByMemberId: "new" },
      unassigned,
      other,
    ]);

    const before = readDataFile("pets.json");
    await reassignPetOwner("nobody", "new");
    expect(readDataFile("pets.json")).toEqual(before);
  });

  it("returns null when updating or removing a missing pet", async () => {
    const { updatePet, removePet } = await load();
    expect(await updatePet("missing", input, null)).toBeNull();
    expect(await removePet("missing")).toBeNull();
  });

  it("removes a pet and returns it", async () => {
    const { addPet, removePet, readPets } = await load();
    const first = await addPet(input, "owner-1", "creator");
    const second = await addPet({ ...input, name: "Rex" }, "owner-2", "creator");
    expect(await removePet(first.id)).toEqual(first);
    expect(await readPets()).toEqual([second]);
  });
});

describe("pets store (Vercel Blob)", () => {
  it("reads and writes the private pets document", async () => {
    useBlobBackend();
    setBlobJson("alliance-manager/pets.json", []);
    const { addPet, readPets } = await load();
    const pet = await addPet(input, "owner", "creator");
    expect(readBlobJson("alliance-manager/pets.json")).toEqual([pet]);
    expect(blobMock.put).toHaveBeenCalledWith("alliance-manager/pets.json", expect.any(String), blobWriteOptions());
    expect(await readPets()).toEqual([pet]);
    expect(dataFileExists("pets.json")).toBe(false);
  });

  it("returns an empty list when the blob is missing", async () => {
    useBlobBackend();
    const { readPets } = await load();
    expect(await readPets()).toEqual([]);
  });
});
