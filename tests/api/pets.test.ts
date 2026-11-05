import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as petsStore from "@/lib/pets/pets-store";
import * as imageStorage from "@/lib/storage/image-storage";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, readDataFile, resetData, writeRawDataFile, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;

type PetView = Record<string, unknown> & {
  id: string;
  ownerId: string;
  ownerName: string;
  canManage: boolean;
  imageUrl?: string;
};

const petInput = {
  name: "Fluffy",
  petType: "frost",
  activity: "nocturnal",
  habitat: "mountain",
  rarity: "rare",
  eggTradeAvailable: true,
  classes: { combat: "S", agility: "A", health: "B" },
  portal: "0123456789AB",
  galaxy: 0,
  planetName: "Ruba",
  coordinates: "+1, -2",
  note: "friendly",
};

function storedPet(overrides: Record<string, unknown> = {}): Record<string, unknown> & { id: string } {
  return {
    id: `pet-${Math.random().toString(36).slice(2, 8)}`,
    ...petInput,
    ownerId: cast.user.publicId,
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

function pngFile(type = "image/png", size = 16) {
  return new File([new Uint8Array(size)], "pet.png", { type });
}

function multipart(method: string, payload: unknown, image?: File) {
  const form = new FormData();
  form.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  if (image) form.set("image", image);
  return new Request("http://localhost:3000/api/pets", { method, body: form });
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  vi.restoreAllMocks();
});

async function call(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, image?: File) {
  const route = await import("@/app/api/pets/route");
  if (method === "GET") return route.GET();
  if (method === "DELETE") return route.DELETE(jsonRequest("/api/pets", method, body));
  return route[method](multipart(method, body ?? {}, image));
}

async function petsOf(response: Response) {
  return ((await response.json()) as { pets: PetView[] }).pets;
}

const uploadFiles = () => path.join(process.cwd(), "data", "uploads", "alliance-manager", "pets");

describe("access", () => {
  it.each(["pending", "blocked", "offline"] as const)("rejects %s members", async (key) => {
    signInAs(cast[key]);
    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      expect((await call(method, petInput)).status, method).toBe(401);
    }
  });

  it("rejects requests without a session", async () => {
    signInAs(null);
    expect((await call("GET")).status).toBe(401);
  });
});

describe("GET /api/pets", () => {
  it("shows every pet to approved members with owner details and manage permission", async () => {
    const own = storedPet();
    const other = storedPet({ ownerId: cast.admin.publicId });
    const orphan = storedPet({ ownerId: "removed-member", imagePath: "alliance-manager/pets/1111-aaaa.png" });
    const withImage = storedPet({ imagePath: "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png" });
    writeDataFile("pets.json", [own, other, orphan, withImage]);
    signInAs(cast.user);

    const pets = await petsOf(await call("GET"));

    expect(pets.map((pet) => [pet.id, pet.canManage])).toEqual([
      [own.id, true],
      [other.id, false],
      [orphan.id, false],
      [withImage.id, true],
    ]);
    const orphanView = pets.find((pet) => pet.id === orphan.id);
    expect(orphanView?.ownerName).toBe("");
    expect(orphanView?.imageUrl).toBeUndefined();
    expect(pets.find((pet) => pet.id === own.id)?.ownerName).toBeTruthy();
    expect(pets.find((pet) => pet.id === withImage.id)?.imageUrl).toBe(
      `/api/pets/image?path=${encodeURIComponent(withImage.imagePath as string)}`,
    );
    expect(pets.every((pet) => !("imagePath" in pet))).toBe(true);
  });

  it("lets moderators and admins manage every pet", async () => {
    writeDataFile("pets.json", [storedPet()]);
    for (const member of [cast.moderator, cast.admin]) {
      signInAs(member);
      expect((await petsOf(await call("GET")))[0].canManage).toBe(true);
    }
  });

  it("downgrades staff in simple view to regular permissions", async () => {
    writeDataFile("pets.json", [storedPet()]);
    signInAs(cast.simpleAdmin);
    expect((await petsOf(await call("GET")))[0].canManage).toBe(false);
  });

  it("returns 503 when the store cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("pets.json", "{not json");
    signInAs(cast.user);
    const response = await call("GET");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "pets.error_unable_to_read" });
  });
});

describe("GET /api/pets?count=1", () => {
  const request = () => new Request("http://localhost:3000/api/pets?count=1");

  it("returns the pet count to staff only, unassigned pets included", async () => {
    writeDataFile("pets.json", [storedPet(), storedPet({ ownerId: null })]);
    const route = await import("@/app/api/pets/route");
    for (const member of [cast.moderator, cast.admin]) {
      signInAs(member);
      const response = await route.GET(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 2 });
    }
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      const response = await route.GET(request());
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "pets.error_access_required" });
    }
  });

  it("returns 503 when the pets cannot be counted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("pets.json", "{not json");
    signInAs(cast.moderator);
    const route = await import("@/app/api/pets/route");
    expect((await route.GET(request())).status).toBe(503);
  });
});

describe("canMessageOwner", () => {
  it("is true only with egg trade, a real discoverer and a different viewer", async () => {
    const offered = storedPet({ eggTradeAvailable: true, ownerId: cast.admin.publicId });
    const own = storedPet({ eggTradeAvailable: true, ownerId: cast.user.publicId });
    const noEgg = storedPet({ eggTradeAvailable: false, ownerId: cast.admin.publicId });
    const unassigned = storedPet({ eggTradeAvailable: true, ownerId: null });
    const offline = storedPet({ eggTradeAvailable: true, ownerId: cast.offline.publicId });
    const gone = storedPet({ eggTradeAvailable: true, ownerId: "removed" });
    writeDataFile("pets.json", [offered, own, noEgg, unassigned, offline, gone]);
    signInAs(cast.user);
    const flags = Object.fromEntries((await petsOf(await call("GET"))).map((pet) => [pet.id, pet.canMessageOwner]));
    expect(flags).toEqual({
      [offered.id]: true,
      [own.id]: false,
      [noEgg.id]: false,
      [unassigned.id]: false,
      [offline.id]: false,
      [gone.id]: false,
    });
  });
});

describe("GET /api/pets by system", () => {
  async function getScoped(query: string) {
    const route = await import("@/app/api/pets/route");
    return route.GET(new Request(`http://localhost:3000/api/pets?${query}`));
  }

  it("returns only the pets of the system, ignoring the first glyph", async () => {
    const same = storedPet({ portal: "1123456789AB", galaxy: 2 });
    const otherSystem = storedPet({ portal: "0123456789AC", galaxy: 2 });
    const otherGalaxy = storedPet({ portal: "1123456789AB", galaxy: 3 });
    writeDataFile("pets.json", [same, otherSystem, otherGalaxy]);
    signInAs(cast.user);
    const pets = await petsOf(await getScoped("systemPortal=2123456789ab&galaxy=2"));
    expect(pets.map((pet) => pet.id)).toEqual([same.id]);
  });

  it.each([
    "systemPortal=0123456789AB",
    "galaxy=2",
    "systemPortal=XYZ&galaxy=2",
    "systemPortal=0123456789AB&galaxy=256",
    "systemPortal=0123456789AB&galaxy=abc",
  ])("rejects the invalid scope %s", async (query) => {
    signInAs(cast.user);
    const response = await getScoped(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "farms.error_invalid_portal_and_galaxy" });
  });
});

describe("GET /api/pets for one pet", () => {
  it("returns only the requested pet, or 404", async () => {
    const first = storedPet();
    const second = storedPet();
    writeDataFile("pets.json", [first, second]);
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    const response = await route.GET(new Request(`http://localhost:3000/api/pets?detailPet=${second.id}`));
    expect((await petsOf(response)).map((pet) => pet.id)).toEqual([second.id]);

    const missing = await route.GET(new Request("http://localhost:3000/api/pets?detailPet=missing"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "pets.error_not_found" });
  });

  it("widens a detail request to every pet of the same planet with samePlanet", async () => {
    const wanted = storedPet({ portal: "1123456789AB", galaxy: 2 });
    const sibling = storedPet({ portal: "1123456789ab", galaxy: 2 });
    const otherPlanet = storedPet({ portal: "2123456789AB", galaxy: 2 });
    const otherGalaxy = storedPet({ portal: "1123456789AB", galaxy: 3 });
    writeDataFile("pets.json", [wanted, sibling, otherPlanet, otherGalaxy]);
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    const found = await route.GET(new Request(`http://localhost:3000/api/pets?detailPet=${wanted.id}&samePlanet=1`));
    expect((await petsOf(found)).map((pet) => pet.id)).toEqual([wanted.id, sibling.id]);
    const alone = await route.GET(new Request(`http://localhost:3000/api/pets?detailPet=${wanted.id}`));
    expect((await petsOf(alone)).map((pet) => pet.id)).toEqual([wanted.id]);
    const missing = await route.GET(new Request("http://localhost:3000/api/pets?detailPet=missing&samePlanet=1"));
    expect(missing.status).toBe(404);
  });
});

describe("station links", () => {
  it("adds the station link when the member can see a station in the pet's system", async () => {
    const pet = storedPet({ portal: "1123456789AB" });
    writeDataFile("pets.json", [pet, storedPet({ portal: "0AAAAAAAAAAA" })]);
    writeDataFile("stations-v2.json", [{ ownerId: cast.user.publicId, portal: "2123456789AB", galaxy: 0 }]);
    signInAs(cast.user);
    const [linked, unlinked] = await petsOf(await call("GET"));
    expect(linked.stationHref).toBe(
      `/stations/${encodeURIComponent(`${cast.user.publicId}:2123456789AB:0`)}?from=pets`,
    );
    expect(unlinked.stationHref).toBeUndefined();
  });
});

describe("POST /api/pets", () => {
  it("creates a pet owned by the member and returns the refreshed list", async () => {
    signInAs(cast.user);
    const response = await call("POST", petInput);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { pet: { id: string }; pets: PetView[] };
    expect(body.pets.map((pet) => pet.id)).toEqual([body.pet.id]);
    expect(readDataFile<Record<string, unknown>[]>("pets.json")[0]).toMatchObject({
      ...petInput,
      ownerId: cast.user.publicId,
    });
  });

  it("returns the first validation error", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...petInput, name: "" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "pets.error_name_required" });
  });

  it("treats an unreadable multipart payload as empty", async () => {
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    const response = await route.POST(multipart("POST", "{broken"));
    expect(response.status).toBe(400);
  });

  it("rejects malformed multipart and JSON bodies and multipart bodies without a payload", async () => {
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    const broken = new Request("http://localhost:3000/api/pets", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: "garbage",
    });
    expect((await route.POST(broken)).status).toBe(400);
    expect((await route.POST(jsonRequest("/api/pets", "POST", "{bad"))).status).toBe(400);
    const emptyForm = new Request("http://localhost:3000/api/pets", { method: "POST", body: new FormData() });
    expect((await route.POST(emptyForm)).status).toBe(400);
  });

  it("accepts a JSON body without an image", async () => {
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    expect((await route.POST(jsonRequest("/api/pets", "POST", petInput))).status).toBe(201);
  });

  it("stores a valid image under the pets folder and exposes its URL", async () => {
    signInAs(cast.user);
    const response = await call("POST", petInput, pngFile());
    expect(response.status).toBe(201);
    const [pet] = await petsOf(response);
    const imagePath = new URL(pet.imageUrl as string, "http://localhost").searchParams.get("path") ?? "";
    expect(imagePath).toMatch(/^alliance-manager\/pets\/[\da-f-]{36}\.png$/);
    expect(existsSync(path.join(process.cwd(), "data", "uploads", imagePath))).toBe(true);
  });

  it.each([
    ["a wrong type", pngFile("image/gif")],
    ["an oversized image", pngFile("image/png", 5 * 1024 * 1024 + 1)],
  ])("rejects %s without saving anything", async (_label, image) => {
    signInAs(cast.user);
    const response = await call("POST", petInput, image);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "pets.error_image_invalid" });
    expect(existsSync(uploadFiles())).toBe(false);
    expect(existsSync(path.join(process.cwd(), "data", "pets.json"))).toBe(false);
  });

  it("removes the stored image when saving the pet fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(petsStore, "addPet").mockRejectedValue(new Error("disk full"));
    signInAs(cast.user);
    const response = await call("POST", petInput, pngFile());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "pets.error_unable_to_save" });
    expect(
      existsSync(uploadFiles()) ? await import("node:fs").then((fs) => fs.readdirSync(uploadFiles())) : [],
    ).toEqual([]);
  });
});

describe("discoverer assignment", () => {
  const stored = () => readDataFile<Record<string, unknown>[]>("pets.json");

  it("records the creator and defaults staff to themselves", async () => {
    signInAs(cast.moderator);
    expect((await call("POST", petInput)).status).toBe(201);
    expect(stored()[0]).toMatchObject({ ownerId: cast.moderator.publicId, createdByMemberId: cast.moderator.publicId });
  });

  it("lets staff assign another approved member or leave the pet unassigned", async () => {
    signInAs(cast.moderator);
    expect((await call("POST", { ...petInput, ownerId: cast.user.publicId })).status).toBe(201);
    expect(stored()[0]).toMatchObject({ ownerId: cast.user.publicId, createdByMemberId: cast.moderator.publicId });

    const response = await call("POST", { ...petInput, ownerId: null });
    expect(response.status).toBe(201);
    expect(stored()[1].ownerId).toBeNull();
    const views = await petsOf(await call("GET"));
    expect(views[1]).toMatchObject({ ownerId: null, ownerName: "", canManage: true });
  });

  it("rejects discoverers who are not approved members", async () => {
    signInAs(cast.admin);
    for (const ownerId of [cast.pending.publicId, cast.blocked.publicId, "unknown"]) {
      const response = await call("POST", { ...petInput, ownerId });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "pets.error_discoverer_must_be_approved" });
    }
    expect(existsSync(path.join(process.cwd(), "data", "pets.json"))).toBe(false);
  });

  it("keeps regular users as the discoverer of what they save", async () => {
    signInAs(cast.user);
    expect((await call("POST", { ...petInput, ownerId: cast.user.publicId })).status).toBe(201);
    for (const ownerId of [cast.admin.publicId, null]) {
      const response = await call("POST", { ...petInput, ownerId });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "pets.error_cannot_assign_another_discoverer" });
    }
    expect(stored()).toHaveLength(1);
  });

  it("does not store the image when the discoverer is rejected", async () => {
    signInAs(cast.user);
    expect((await call("POST", { ...petInput, ownerId: cast.admin.publicId }, pngFile())).status).toBe(403);
    expect(existsSync(uploadFiles())).toBe(false);
  });

  it("lets staff reassign or clear the discoverer on update and keeps it when omitted", async () => {
    const pet = storedPet({ createdByMemberId: cast.user.publicId });
    writeDataFile("pets.json", [pet]);
    signInAs(cast.admin);
    expect((await call("PATCH", { ...petInput, id: pet.id })).status).toBe(200);
    expect(stored()[0]).toMatchObject({ ownerId: cast.user.publicId, createdByMemberId: cast.user.publicId });
    expect((await call("PATCH", { ...petInput, id: pet.id, ownerId: cast.moderator.publicId })).status).toBe(200);
    expect(stored()[0].ownerId).toBe(cast.moderator.publicId);
    expect((await call("PATCH", { ...petInput, id: pet.id, ownerId: null })).status).toBe(200);
    expect(stored()[0].ownerId).toBeNull();
    const response = await call("PATCH", { ...petInput, id: pet.id, ownerId: cast.pending.publicId });
    expect(response.status).toBe(400);
  });

  it("stops regular users from changing the discoverer of their pets", async () => {
    const pet = storedPet();
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    expect((await call("PATCH", { ...petInput, id: pet.id, ownerId: cast.user.publicId })).status).toBe(200);
    for (const ownerId of [cast.admin.publicId, null]) {
      const response = await call("PATCH", { ...petInput, id: pet.id, ownerId });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "pets.error_cannot_assign_another_discoverer" });
    }
  });

  it("limits unassigned pets to staff", async () => {
    const pet = storedPet({ ownerId: null });
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    expect((await petsOf(await call("GET")))[0].canManage).toBe(false);
    expect((await call("PATCH", { ...petInput, id: pet.id })).status).toBe(403);
    expect((await call("DELETE", { id: pet.id })).status).toBe(403);
    signInAs(cast.moderator);
    expect((await call("PATCH", { ...petInput, id: pet.id, ownerId: cast.user.publicId })).status).toBe(200);
    writeDataFile("pets.json", [storedPet({ ownerId: null })]);
    expect((await call("DELETE", { id: stored()[0].id })).status).toBe(200);
  });
});

describe("PATCH /api/pets", () => {
  it("lets the owner update the pet and keeps the owner and image", async () => {
    const pet = storedPet({ imagePath: "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png" });
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    const response = await call("PATCH", { ...petInput, id: pet.id, name: "Rex" });
    expect(response.status).toBe(200);
    expect(readDataFile<Record<string, unknown>[]>("pets.json")[0]).toMatchObject({
      name: "Rex",
      ownerId: cast.user.publicId,
      imagePath: pet.imagePath,
    });
  });

  it("lets moderators edit any pet", async () => {
    const pet = storedPet();
    writeDataFile("pets.json", [pet]);
    signInAs(cast.moderator);
    expect((await call("PATCH", { ...petInput, id: pet.id })).status).toBe(200);
    expect(readDataFile<Record<string, unknown>[]>("pets.json")[0].ownerId).toBe(cast.user.publicId);
  });

  it("forbids editing another member's pet", async () => {
    const pet = storedPet({ ownerId: cast.admin.publicId });
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    const response = await call("PATCH", { ...petInput, id: pet.id });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "pets.error_cannot_edit_another_member_s_pet" });
  });

  it("returns 404 without an id or for a missing pet and 400 for invalid data", async () => {
    signInAs(cast.user);
    expect((await call("PATCH", petInput)).status).toBe(404);
    expect((await call("PATCH", { ...petInput, id: "missing" })).status).toBe(404);
    expect((await call("PATCH", { ...petInput, id: "x", note: "n".repeat(1001) })).status).toBe(400);
    expect((await call("PATCH", { ...petInput, id: "x" }, pngFile("image/gif"))).status).toBe(400);
  });

  it("replaces the image and deletes the previous one", async () => {
    signInAs(cast.user);
    const created = await petsOf(await call("POST", petInput, pngFile()));
    const oldPath = new URL(created[0].imageUrl as string, "http://localhost").searchParams.get("path") ?? "";
    const response = await call("PATCH", { ...petInput, id: created[0].id }, pngFile("image/webp"));
    expect(response.status).toBe(200);
    const [pet] = await petsOf(response);
    const newPath = new URL(pet.imageUrl as string, "http://localhost").searchParams.get("path") ?? "";
    expect(newPath).toMatch(/\.webp$/);
    expect(existsSync(path.join(process.cwd(), "data", "uploads", newPath))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "data", "uploads", oldPath))).toBe(false);
  });

  it("removes the image on request", async () => {
    signInAs(cast.user);
    const created = await petsOf(await call("POST", petInput, pngFile()));
    const oldPath = new URL(created[0].imageUrl as string, "http://localhost").searchParams.get("path") ?? "";
    const [pet] = await petsOf(await call("PATCH", { ...petInput, id: created[0].id, removeImage: true }));
    expect(pet.imageUrl).toBeUndefined();
    expect(existsSync(path.join(process.cwd(), "data", "uploads", oldPath))).toBe(false);
  });

  it("deletes the new image when the pet disappears or saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pet = storedPet();
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    const deleteImage = vi.spyOn(imageStorage, "deleteImage");

    vi.spyOn(petsStore, "updatePet").mockResolvedValueOnce(null);
    expect((await call("PATCH", { ...petInput, id: pet.id }, pngFile())).status).toBe(404);
    expect(deleteImage).toHaveBeenCalledTimes(1);

    vi.spyOn(petsStore, "updatePet").mockRejectedValueOnce(new Error("disk full"));
    const response = await call("PATCH", { ...petInput, id: pet.id }, pngFile());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "pets.error_unable_to_save" });
    expect(deleteImage).toHaveBeenCalledTimes(2);
  });
});

describe("DELETE /api/pets", () => {
  it("lets the owner delete a pet together with its image", async () => {
    signInAs(cast.user);
    const created = await petsOf(await call("POST", petInput, pngFile()));
    const imagePath = new URL(created[0].imageUrl as string, "http://localhost").searchParams.get("path") ?? "";
    const response = await call("DELETE", { id: created[0].id });
    expect(response.status).toBe(200);
    expect(await petsOf(response)).toEqual([]);
    expect(existsSync(path.join(process.cwd(), "data", "uploads", imagePath))).toBe(false);
  });

  it("keeps the deletion when the image cannot be removed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pet = storedPet({ imagePath: "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png" });
    writeDataFile("pets.json", [pet]);
    vi.spyOn(imageStorage, "deleteImage").mockRejectedValue(new Error("blob down"));
    signInAs(cast.user);
    expect((await call("DELETE", { id: pet.id })).status).toBe(200);
    expect(readDataFile<unknown[]>("pets.json")).toEqual([]);
  });

  it("forbids deleting another member's pet, allows moderators and returns 404 for missing pets", async () => {
    const pet = storedPet({ ownerId: cast.admin.publicId });
    writeDataFile("pets.json", [pet]);
    signInAs(cast.user);
    const forbidden = await call("DELETE", { id: pet.id });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "pets.error_cannot_remove_another_member_s_pet" });
    expect((await call("DELETE", { id: "missing" })).status).toBe(404);
    signInAs(cast.moderator);
    expect((await call("DELETE", { id: pet.id })).status).toBe(200);
  });

  it("returns 503 when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("pets.json", "{not json");
    signInAs(cast.user);
    expect((await call("DELETE", { id: "x" })).status).toBe(503);
  });

  it("returns 404 for bodies without a usable id", async () => {
    signInAs(cast.user);
    const route = await import("@/app/api/pets/route");
    expect((await route.DELETE(new Request("http://localhost:3000/api/pets", { method: "DELETE" }))).status).toBe(404);
    expect((await call("DELETE", [])).status).toBe(404);
    expect((await call("DELETE", { id: 5 })).status).toBe(404);
  });
});

describe("GET /api/pets/image", () => {
  const imagePath = "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png";

  async function fetchImage(pathname?: string) {
    const { GET } = await import("@/app/api/pets/image/route");
    const query = pathname === undefined ? "" : `?path=${encodeURIComponent(pathname)}`;
    return GET(new Request(`http://localhost:3000/api/pets/image${query}`));
  }

  it("requires an approved member", async () => {
    signInAs(null);
    expect((await fetchImage(imagePath)).status).toBe(401);
    signInAs(cast.pending);
    expect((await fetchImage(imagePath)).status).toBe(401);
  });

  it("serves a stored image with private caching", async () => {
    signInAs(cast.user);
    await imageStorage.storeImage(imagePath, pngFile());
    const response = await fetchImage(imagePath);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns 404 for other folders, traversal and missing images", async () => {
    signInAs(cast.user);
    for (const pathname of [
      undefined,
      "alliance-manager/branding/11111111-2222-4333-8444-555555555555.png",
      "alliance-manager/pets/../access.json",
      imagePath,
    ]) {
      expect((await fetchImage(pathname)).status, String(pathname)).toBe(404);
    }
  });

  it("returns 503 when reading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(imageStorage, "readImage").mockRejectedValue(new Error("blob down"));
    signInAs(cast.user);
    expect((await fetchImage(imagePath)).status).toBe(503);
  });
});
