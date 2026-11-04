import { beforeEach, describe, expect, it, vi } from "vitest";
import * as farmsStore from "@/lib/farms/farms-store";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, readDataFile, resetData, writeRawDataFile, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const P0 = "0123456789AB";
const fetchMock = vi.fn();
let cast: Cast;

type FarmView = Record<string, unknown> & { id: string; ownerId: string; canManage: boolean };

const farmInput = {
  name: "Copper hill",
  portal: P0,
  galaxy: 0,
  planetName: "Ruba",
  resources: ["Copper", "Frost Crystal"],
};

function storedFarm(overrides: Record<string, unknown> = {}) {
  return {
    id: `farm-${Math.random().toString(36).slice(2, 8)}`,
    ...farmInput,
    ownerId: cast.user.publicId,
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

async function call(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) {
  const route = await import("@/app/api/farms/route");
  if (method === "GET") return route.GET();
  return route[method](jsonRequest("/api/farms", method, body));
}

async function farmsOf(response: Response) {
  return ((await response.json()) as { farms: FarmView[] }).farms;
}

describe("access", () => {
  it.each(["pending", "blocked", "offline"] as const)("rejects %s members", async (key) => {
    signInAs(cast[key]);
    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      const response = await call(method, farmInput);
      expect(response.status, method).toBe(401);
    }
  });

  it("rejects requests without a session", async () => {
    signInAs(null);
    expect((await call("GET")).status).toBe(401);
  });
});

describe("GET /api/farms", () => {
  it("shows every farm to approved members with owner details and manage permission", async () => {
    const own = storedFarm();
    const other = storedFarm({ ownerId: cast.admin.publicId });
    const orphan = storedFarm({ ownerId: "removed-member" });
    writeDataFile("farms.json", [own, other, orphan]);
    signInAs(cast.user);

    const farms = await farmsOf(await call("GET"));

    expect(farms.map((farm) => [farm.id, farm.canManage])).toEqual([
      [own.id, true],
      [other.id, false],
      [orphan.id, false],
    ]);
    expect(farms[1]).toMatchObject({ ownerName: cast.admin.nmsName, ownerMemberId: cast.admin.publicId });
    expect(farms[2].ownerName).toBe("");
    expect(farms[2]).not.toHaveProperty("ownerMemberId");
  });

  it("uses cached Almanac pictures without external requests", async () => {
    writeDataFile("farms.json", [storedFarm(), storedFarm({ galaxy: 1 })]);
    writeDataFile("almanac.json", { [P0]: { 0: { pictures: { disc: "/planets/ruba.jpg" } } } });
    signInAs(cast.user);

    const farms = await farmsOf(await call("GET"));

    expect(farms[0].planetImageUrl).toBe("https://nmsalmanac.com/api/planets/ruba.jpg");
    expect(farms[1]).not.toHaveProperty("planetImageUrl");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the owner's avatar when the profile has one", async () => {
    seedMembers(castMembers(cast).map((member) => (member === cast.admin ? { ...member, image: "/a.png" } : member)));
    writeDataFile("farms.json", [storedFarm({ ownerId: cast.admin.publicId }), storedFarm()]);
    signInAs(cast.user);
    const farms = await farmsOf(await call("GET"));
    expect(farms[0].ownerImage).toBe("/a.png");
    expect(farms[1]).not.toHaveProperty("ownerImage");
  });

  it("lets moderators manage every farm, but not in simple view", async () => {
    writeDataFile("farms.json", [storedFarm()]);
    signInAs(cast.moderator);
    expect((await farmsOf(await call("GET")))[0].canManage).toBe(true);
    signInAs(cast.simpleAdmin);
    expect((await farmsOf(await call("GET")))[0].canManage).toBe(false);
  });

  it("returns 503 when the farms document cannot be read", async () => {
    writeRawDataFile("farms.json", "{not json");
    signInAs(cast.user);
    expect((await call("GET")).status).toBe(503);
  });

  it("filters farms by system, ignoring the planet glyph and matching the galaxy", async () => {
    const samePlanet = storedFarm();
    const otherPlanet = storedFarm({ portal: `2${P0.slice(1)}` });
    const otherGalaxy = storedFarm({ galaxy: 1 });
    const otherSystem = storedFarm({ portal: "0123456789AC" });
    writeDataFile("farms.json", [samePlanet, otherPlanet, otherGalaxy, otherSystem]);
    signInAs(cast.user);
    const route = await import("@/app/api/farms/route");

    const response = await route.GET(
      new Request(`http://localhost/api/farms?systemPortal=${P0.toLowerCase()}&galaxy=0`),
    );

    expect((await farmsOf(response)).map((farm) => farm.id).sort()).toEqual([samePlanet.id, otherPlanet.id].sort());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([["systemPortal=XYZ&galaxy=0"], [`systemPortal=${P0}&galaxy=256`], [`systemPortal=${P0}`], ["galaxy=0"]])(
    "rejects an invalid system scope (%s)",
    async (query) => {
      signInAs(cast.user);
      const route = await import("@/app/api/farms/route");
      expect((await route.GET(new Request(`http://localhost/api/farms?${query}`))).status).toBe(400);
    },
  );
});

describe("GET /api/farms counters and details", () => {
  it("returns the farm count to staff only", async () => {
    writeDataFile("farms.json", [storedFarm(), storedFarm({ ownerId: null })]);
    const route = await import("@/app/api/farms/route");
    const request = () => new Request("http://localhost/api/farms?count=1");
    signInAs(cast.moderator);
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 2 });
    signInAs(cast.user);
    expect((await route.GET(request())).status).toBe(403);
  });

  it("returns a single farm by id and 404 when it does not exist", async () => {
    const wanted = storedFarm();
    writeDataFile("farms.json", [wanted, storedFarm()]);
    signInAs(cast.user);
    const route = await import("@/app/api/farms/route");
    const found = await route.GET(new Request(`http://localhost/api/farms?detailFarm=${wanted.id}`));
    expect((await farmsOf(found)).map((farm) => farm.id)).toEqual([wanted.id]);
    const missing = await route.GET(new Request("http://localhost/api/farms?detailFarm=missing"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "farms.error_not_found" });
  });
});

describe("unassigned farms", () => {
  it("returns an empty list without reading stations when there are no farms", async () => {
    signInAs(cast.user);
    const response = await call("GET");
    expect(await farmsOf(response)).toEqual([]);
  });

  it("lets staff create, release and reassign farms without an owner", async () => {
    signInAs(cast.moderator);
    const created = await call("POST", { ...farmInput, ownerId: null });
    expect(created.status).toBe(201);
    const { farm } = (await created.json()) as { farm: FarmView };
    expect(farm.ownerId).toBeNull();

    const released = storedFarm();
    writeDataFile("farms.json", [released]);
    const patched = await call("PATCH", { ...farmInput, id: released.id, ownerId: null });
    expect(patched.status).toBe(200);
    const [view] = await farmsOf(patched);
    expect(view).toMatchObject({ ownerId: null, ownerName: "", canManage: true });
    expect(view.ownerMemberId).toBeUndefined();

    const kept = await call("PATCH", { ...farmInput, id: released.id, ownerId: null, name: "Still free" });
    expect((await farmsOf(kept))[0]).toMatchObject({ ownerId: null, name: "Still free" });
    const assigned = await call("PATCH", { ...farmInput, id: released.id, ownerId: cast.user.publicId });
    expect((await farmsOf(assigned))[0].ownerId).toBe(cast.user.publicId);
  });

  it("keeps unassigned farms read-only for regular members, who cannot release their own", async () => {
    const free = storedFarm({ ownerId: null });
    const own = storedFarm();
    writeDataFile("farms.json", [free, own]);
    signInAs(cast.user);
    const views = await farmsOf(await call("GET"));
    expect(views.find((farm) => farm.id === free.id)).toMatchObject({ ownerId: null, canManage: false });
    expect((await call("PATCH", { ...farmInput, id: free.id })).status).toBe(403);
    expect((await call("DELETE", { id: free.id })).status).toBe(403);
    expect((await call("PATCH", { ...farmInput, id: own.id, ownerId: null })).status).toBe(403);
    expect((await call("POST", { ...farmInput, ownerId: null })).status).toBe(403);
  });

  it("links a farm to the visible station of its system", async () => {
    const linked = storedFarm({ portal: `2${P0.slice(1)}` });
    const alone = storedFarm({ portal: "0123456789AC" });
    writeDataFile("farms.json", [linked, alone]);
    writeDataFile("stations-v2.json", [{ ownerId: cast.user.publicId, portal: P0, galaxy: 0 }]);
    signInAs(cast.user);
    const views = await farmsOf(await call("GET"));
    expect(views.find((farm) => farm.id === linked.id)?.stationHref).toMatch(
      new RegExp(`^/stations/${encodeURIComponent(`${cast.user.publicId}:${P0}:0`)}\\?from=farms`),
    );
    expect(views.find((farm) => farm.id === alone.id)?.stationHref).toBeUndefined();
  });

  it("rejects a malformed request body", async () => {
    signInAs(cast.user);
    expect((await call("POST", "{not json")).status).toBe(400);
  });

  it("returns 404 when the farm disappears while it is being updated", async () => {
    const farm = storedFarm();
    writeDataFile("farms.json", [farm]);
    vi.spyOn(farmsStore, "updateFarm").mockResolvedValueOnce(null);
    signInAs(cast.user);
    expect((await call("PATCH", { ...farmInput, id: farm.id })).status).toBe(404);
  });
});

describe("POST /api/farms", () => {
  it("assigns a regular user's farm to themselves, without requiring a registered system", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...farmInput, coordinates: "1, 2", note: "Bring a suit" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { farm: FarmView; farms: FarmView[] };
    expect(body.farm).toMatchObject({
      ownerId: cast.user.publicId,
      createdByMemberId: cast.user.publicId,
      coordinates: "1, 2",
      note: "Bring a suit",
    });
    expect(body.farms).toHaveLength(1);
    expect(readDataFile<unknown[]>("farms.json")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the system name and returns it without looking up Almanac", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...farmInput, systemName: "  Custom system  " });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { farm: FarmView };
    expect(body.farm.systemName).toBe("Custom system");
    expect(readDataFile<unknown[]>("farms.json")).toMatchObject([{ systemName: "Custom system" }]);
    expect((await farmsOf(await call("GET")))[0].systemName).toBe("Custom system");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forbids regular users from choosing another owner", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...farmInput, ownerId: cast.admin.publicId });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "farms.error_cannot_assign_another_owner" });
  });

  it("accepts an explicit self owner from regular users", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...farmInput, ownerId: cast.user.publicId });
    expect(response.status).toBe(201);
  });

  it("lets moderators pick an approved owner, defaulting to themselves", async () => {
    signInAs(cast.moderator);
    const assigned = await call("POST", { ...farmInput, ownerId: cast.user.publicId });
    expect(((await assigned.json()) as { farm: FarmView }).farm).toMatchObject({
      ownerId: cast.user.publicId,
      createdByMemberId: cast.moderator.publicId,
    });
    const own = await call("POST", { ...farmInput, ownerId: "" });
    expect(((await own.json()) as { farm: FarmView }).farm.ownerId).toBe(cast.moderator.publicId);
  });

  it.each(["pending", "blocked"] as const)("rejects a %s owner chosen by staff", async (key) => {
    signInAs(cast.admin);
    const response = await call("POST", { ...farmInput, ownerId: cast[key].publicId });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "farms.error_owner_must_be_approved" });
  });

  it("applies regular-user rules to staff in simple view", async () => {
    signInAs(cast.simpleAdmin);
    const response = await call("POST", { ...farmInput, ownerId: cast.user.publicId });
    expect(response.status).toBe(403);
  });

  it("validates the payload", async () => {
    signInAs(cast.user);
    const response = await call("POST", { ...farmInput, resources: [] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "farms.error_resources_required" });
    expect((await call("POST", "not json")).status).toBe(400);
  });

  it("returns 503 when the farm cannot be saved", async () => {
    writeRawDataFile("farms.json", "{not json");
    signInAs(cast.user);
    expect((await call("POST", farmInput)).status).toBe(503);
  });
});

describe("PATCH /api/farms", () => {
  it("lets the owner edit their farm while keeping the owner", async () => {
    const farm = storedFarm();
    writeDataFile("farms.json", [farm]);
    signInAs(cast.user);

    const response = await call("PATCH", { id: farm.id, ...farmInput, name: "Renamed" });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { farm: FarmView }).farm).toMatchObject({
      id: farm.id,
      name: "Renamed",
      ownerId: cast.user.publicId,
      createdAt: farm.createdAt,
    });
  });

  it("updates and clears the system name, preserving it for older clients that omit the field", async () => {
    const farm = storedFarm({ systemName: "Original system" });
    writeDataFile("farms.json", [farm]);
    signInAs(cast.user);

    const legacy = await call("PATCH", { id: farm.id, ...farmInput, name: "Renamed" });
    expect(((await legacy.json()) as { farm: FarmView }).farm.systemName).toBe("Original system");
    const sameSystem = await call("PATCH", { id: farm.id, ...farmInput, portal: `1${P0.slice(1)}` });
    expect(((await sameSystem.json()) as { farm: FarmView }).farm.systemName).toBe("Original system");
    const otherSystem = await call("PATCH", { id: farm.id, ...farmInput, galaxy: 1 });
    expect(((await otherSystem.json()) as { farm: FarmView }).farm).not.toHaveProperty("systemName");
    const changed = await call("PATCH", { id: farm.id, ...farmInput, systemName: " New system " });
    expect(((await changed.json()) as { farm: FarmView }).farm.systemName).toBe("New system");
    const cleared = await call("PATCH", { id: farm.id, ...farmInput, systemName: "" });
    expect(((await cleared.json()) as { farm: FarmView }).farm).not.toHaveProperty("systemName");
    expect(readDataFile<unknown[]>("farms.json")[0]).not.toHaveProperty("systemName");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forbids editing another member's farm or reassigning it", async () => {
    const other = storedFarm({ ownerId: cast.admin.publicId });
    const own = storedFarm();
    writeDataFile("farms.json", [other, own]);
    signInAs(cast.user);

    const forbidden = await call("PATCH", { id: other.id, ...farmInput });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "farms.error_cannot_edit_another_member_s_farm" });
    expect((await call("PATCH", { id: own.id, ...farmInput, ownerId: cast.admin.publicId })).status).toBe(403);
  });

  it("lets staff edit and reassign any farm, keeping a removed owner when unchanged", async () => {
    const farm = storedFarm({ ownerId: "removed-member" });
    writeDataFile("farms.json", [farm]);
    signInAs(cast.moderator);

    const kept = await call("PATCH", { id: farm.id, ...farmInput, ownerId: "removed-member" });
    expect(((await kept.json()) as { farm: FarmView }).farm.ownerId).toBe("removed-member");
    const moved = await call("PATCH", { id: farm.id, ...farmInput, ownerId: cast.admin.publicId });
    expect(((await moved.json()) as { farm: FarmView }).farm.ownerId).toBe(cast.admin.publicId);
  });

  it("returns 404 for missing farms and 400 for invalid input", async () => {
    writeDataFile("farms.json", [storedFarm()]);
    signInAs(cast.admin);
    expect((await call("PATCH", { ...farmInput })).status).toBe(404);
    expect((await call("PATCH", { id: "missing", ...farmInput })).status).toBe(404);
    expect((await call("PATCH", { id: "missing", ...farmInput, name: "" })).status).toBe(400);
  });

  it("returns 503 when the farms document cannot be read", async () => {
    writeRawDataFile("farms.json", "{not json");
    signInAs(cast.user);
    expect((await call("PATCH", { id: "x", ...farmInput })).status).toBe(503);
  });
});

describe("DELETE /api/farms", () => {
  it("lets the owner delete their farm", async () => {
    const farm = storedFarm();
    writeDataFile("farms.json", [farm]);
    signInAs(cast.user);
    const response = await call("DELETE", { id: farm.id });
    expect(response.status).toBe(200);
    expect(await farmsOf(response)).toEqual([]);
  });

  it("forbids deleting another member's farm, also for staff in simple view", async () => {
    const farm = storedFarm({ ownerId: cast.admin.publicId });
    writeDataFile("farms.json", [farm]);
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      const response = await call("DELETE", { id: farm.id });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "farms.error_cannot_remove_another_member_s_farm" });
    }
  });

  it("lets moderators delete any farm and returns 404 when missing", async () => {
    const farm = storedFarm();
    writeDataFile("farms.json", [farm]);
    signInAs(cast.moderator);
    expect((await call("DELETE", { id: 42 })).status).toBe(404);
    expect((await call("DELETE", { id: farm.id })).status).toBe(200);
    expect((await call("DELETE", { id: farm.id })).status).toBe(404);
  });

  it("returns 503 when the farms document cannot be read", async () => {
    writeRawDataFile("farms.json", "{not json");
    signInAs(cast.user);
    expect((await call("DELETE", { id: "x" })).status).toBe(503);
  });
});
