import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import {
  castMembers,
  makeCast,
  readDataFile,
  resetData,
  storedMission,
  writeRawDataFile,
  type Cast,
} from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const url = "/api/stations";
// Stesso sistema (pianeti 0 e 1) e due sistemi diversi.
const P0 = "0123456789AB";
const P1 = "1123456789AB";
const Q0 = "0124456789AB";
const R0 = "0125456789AB";

type StoredStation = {
  portal: string;
  galaxy: number;
  ownerId: string;
  name?: string;
  note?: string;
  createdByMemberId?: string;
  createdAt?: string;
};
type StationView = StoredStation & Record<string, unknown>;

let cast: Cast;
let fetchMock: ReturnType<typeof vi.fn>;

function storedStations() {
  return readDataFile<StoredStation[]>("stations-v2.json");
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("missions.json", []);
  writeDataFile("stations-v2.json", [
    {
      portal: P0,
      galaxy: 0,
      ownerId: cast.user.publicId,
      name: "User Base",
      createdByMemberId: cast.user.publicId,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
});

async function routes() {
  return import("@/app/api/stations/route");
}

async function getStations() {
  return (await routes()).GET();
}

async function post(body: unknown) {
  return (await routes()).POST(jsonRequest(url, "POST", body));
}

async function remove(body: unknown) {
  return (await routes()).DELETE(jsonRequest(url, "DELETE", body));
}

async function patch(body: unknown) {
  return (await routes()).PATCH(jsonRequest(url, "PATCH", body));
}

function patchBody(overrides: Record<string, unknown> = {}) {
  return {
    currentPortal: P0,
    currentGalaxy: 0,
    currentOwnerId: cast.user.publicId,
    portal: P0,
    galaxy: 0,
    ownerId: cast.user.publicId,
    name: "Renamed",
    note: "",
    ...overrides,
  };
}

describe("authorization shared by every method", () => {
  const calls = {
    GET: async () => getStations(),
    POST: async () => post({ portal: Q0, galaxy: 0 }),
    DELETE: async () => remove({ portal: P0, galaxy: 0 }),
    PATCH: async () => patch(patchBody()),
  };
  for (const [method, call] of Object.entries(calls)) {
    it(`${method} returns 401 without a session or for pending, blocked and offline members`, async () => {
      signInAs(null);
      expect((await call()).status).toBe(401);
      for (const member of [cast.pending, cast.blocked, cast.offline]) {
        signInAs(member);
        const response = await call();
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "stations.error_access_required" });
      }
      expect(storedStations()).toHaveLength(1);
    });
  }
});

describe("GET /api/stations", () => {
  it("uses planet 1 Almanac data as a fallback for portal codes starting with 0", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const requestUrl = new URL(String(input));
      const address = requestUrl.pathname.split("/").pop();
      if (address === P0) return new Response("", { status: 404 });
      return Response.json({
        portal: address,
        pictures: { disc: "/planets/planet-one.jpg" },
        lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
      });
    });
    signInAs(cast.user);

    const response = await getStations();
    expect(response.status).toBe(200);
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations[0].planet).toMatchObject({
      portal: P1,
      pictures: { disc: "/planets/planet-one.jpg" },
      lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://nmsalmanac.com/api/planets/${P1}?galaxy=1`,
    ]);
    expect(readDataFile<Record<string, Record<string, unknown>>>("almanac.json")[P0]["0"]).toMatchObject({
      portal: P1,
    });
  });

  it("uses an already-cached planet-one record for an existing zero-code station", async () => {
    writeDataFile("almanac.json", {
      [P1]: {
        0: {
          kind: "planet",
          portal: P1,
          galaxy: 1,
          pictures: { disc: "/planets/planet-one.jpg" },
          lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
        },
      },
    });
    signInAs(cast.user);

    const response = await getStations();
    expect(response.status).toBe(200);
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations[0].planet).toMatchObject({
      portal: P1,
      pictures: { disc: "/planets/planet-one.jpg" },
      lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readDataFile<Record<string, Record<string, unknown>>>("almanac.json")[P0]["0"]).toMatchObject({
      portal: P1,
      pictures: { disc: "/planets/planet-one.jpg" },
    });
  });

  it("loads the cached planet-one record for station 00A90348AAB8", async () => {
    const stationPortal = "00A90348AAB8";
    const planetOnePortal = "10A90348AAB8";
    writeDataFile("stations-v2.json", [
      { portal: stationPortal, galaxy: 0, ownerId: cast.user.publicId, name: "Mosangf-Tha X System" },
    ]);
    writeDataFile("almanac.json", {
      [planetOnePortal]: {
        0: {
          kind: "planet",
          portal: planetOnePortal,
          galaxy: 1,
          pictures: { disc: "/planets/planet-one.jpg" },
          lines: { headline: { word: "Hedna XVII" }, band: { star: { word: "Yellow" } } },
        },
      },
    });
    signInAs(cast.user);

    const response = await getStations();
    expect(response.status).toBe(200);
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      portal: stationPortal,
      planet: {
        portal: planetOnePortal,
        pictures: { disc: "/planets/planet-one.jpg" },
        lines: { headline: { word: "Hedna XVII" }, band: { star: { word: "Yellow" } } },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readDataFile<Record<string, Record<string, unknown>>>("almanac.json")[stationPortal]["0"]).toMatchObject({
      portal: planetOnePortal,
    });
  });

  it("replaces incomplete cached Almanac data for existing zero-code stations", async () => {
    writeDataFile("almanac.json", {
      [P0]: { 0: { portal: P0, lines: { headline: { word: "Old cached entry" } } } },
    });
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const requestUrl = new URL(String(input));
      const address = requestUrl.pathname.split("/").pop();
      return Response.json({
        portal: address,
        pictures: { disc: "/planets/planet-one.jpg" },
        lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
      });
    });
    signInAs(cast.user);

    const response = await getStations();
    expect(response.status).toBe(200);
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations[0].planet).toMatchObject({
      portal: P1,
      pictures: { disc: "/planets/planet-one.jpg" },
      lines: { headline: { word: "Planet One" }, band: { star: { word: "Yellow" } } },
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://nmsalmanac.com/api/planets/${P1}?galaxy=1`,
    ]);
    expect(readDataFile<Record<string, Record<string, unknown>>>("almanac.json")[P0]["0"]).toMatchObject({
      portal: P1,
      pictures: { disc: "/planets/planet-one.jpg" },
    });
  });

  it("shows every station with owner, planet and mission details", async () => {
    const owner = makeMember({ image: "https://img.example/o.png", specialty: "builder" });
    seedMembers([...castMembers(cast), owner]);
    writeDataFile("stations-v2.json", [
      { portal: P0, galaxy: 0, ownerId: owner.publicId, name: "Base" },
      { portal: Q0, galaxy: 0, ownerId: "removed-member" },
      { portal: R0, galaxy: 2, ownerId: cast.moderator.publicId },
    ]);
    writeDataFile("almanac.json", { [P0]: { 0: { portal: P0, lines: { headline: { word: "Eden" } } } } });
    writeDataFile("missions.json", [
      storedMission({ id: "M-1", systemAddress: P0, galaxy: 0, targetSpecialty: "builder", status: "pending" }),
      storedMission({
        id: "M-2",
        systemAddress: Q0.toLowerCase(),
        galaxy: 0,
        targetSpecialty: "all",
        status: "completed",
      }),
      storedMission({
        id: "M-3",
        systemAddress: R0,
        galaxy: 2,
        targetSpecialty: "explorer_builder",
        status: "in_progress",
        assignedMemberId: owner.publicId,
      }),
    ]);
    signInAs(owner);
    const response = await getStations();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations).toHaveLength(3);
    const [base, orphan, assigned] = stations;
    expect(base).toMatchObject({
      ownerId: owner.publicId,
      ownerMemberId: owner.publicId,
      ownerName: owner.nmsName,
      ownerNmsName: owner.nmsName,
      ownerImage: "https://img.example/o.png",
      planet: { portal: P0, lines: { headline: { word: "Eden" } } },
      hasMissions: true,
      canOpenOwnSpecialtyMission: true,
      specialtyMissionId: "M-1",
      hasAssignedMission: false,
      missionStatus: "in_progress",
      availableSpecialties: ["ranger", "explorer", "other"],
    });
    expect(orphan).toMatchObject({
      ownerName: "Former member",
      ownerNmsName: "",
      planet: null,
      missionStatus: "completed",
      availableSpecialties: ["other"],
      canOpenOwnSpecialtyMission: false,
    });
    expect(orphan.ownerId).toBeUndefined();
    expect(orphan).not.toHaveProperty("ownerMemberId");
    expect(orphan).not.toHaveProperty("ownerImage");
    expect(assigned).toMatchObject({
      hasAssignedMission: true,
      canOpenOwnSpecialtyMission: true,
      specialtyMissionId: "M-3",
      missionStatus: "in_progress",
    });
  });

  it.todo(
    "treats an explorer_builder mission as covering builder and explorer in availableSpecialties (currently still offered, see report)",
  );

  it.each(["all", "explorer_builder"] as const)(
    "links an explorer to a free %s mission covering their specialty",
    async (targetSpecialty) => {
      writeDataFile("missions.json", [
        storedMission({ id: "covered", systemAddress: P0, galaxy: 0, targetSpecialty, status: "pending" }),
      ]);
      signInAs(cast.user);
      const { stations } = await (await getStations()).json();
      expect(stations[0]).toMatchObject({ canOpenOwnSpecialtyMission: true, specialtyMissionId: "covered" });
    },
  );

  it("reports stations without missions as fully available", async () => {
    signInAs(cast.moderator);
    const { stations } = (await (await getStations()).json()) as { stations: StationView[] };
    expect(stations[0]).toMatchObject({
      hasMissions: false,
      missionStatus: "none",
      availableSpecialties: ["all", "explorer_builder", "builder", "ranger", "explorer", "other"],
      ownerName: cast.user.nmsName,
    });
  });

  it("does not offer a specialty mission that is taken by someone else", async () => {
    writeDataFile("missions.json", [
      storedMission({
        systemAddress: P0,
        galaxy: 0,
        targetSpecialty: "explorer",
        status: "pending",
        assignedMemberId: cast.admin.publicId,
      }),
    ]);
    signInAs(cast.user);
    const { stations } = (await (await getStations()).json()) as { stations: StationView[] };
    expect(stations[0]).toMatchObject({ canOpenOwnSpecialtyMission: false, hasAssignedMission: false });
    expect(stations[0]).not.toHaveProperty("specialtyMissionId");
  });

  it.each(["explorer", "builder", "ranger"] as const)(
    "selects only the effective manager's %s specialty mission, never an unrelated mission",
    async (specialty) => {
      const manager = { ...cast.moderator, specialty, simpleView: false };
      seedMembers([...castMembers(cast).filter((member) => member.publicId !== manager.publicId), manager]);
      writeDataFile("missions.json", [
        storedMission({ id: "wrong-galaxy", systemAddress: P0, galaxy: 1, targetSpecialty: specialty }),
        storedMission({ id: "wrong-system", systemAddress: Q0, galaxy: 0, targetSpecialty: specialty }),
        storedMission({ id: "unrelated", systemAddress: P0, galaxy: 0, targetSpecialty: "other" }),
        storedMission({ id: "matching", systemAddress: P0, galaxy: 0, targetSpecialty: specialty }),
      ]);
      signInAs(manager);
      const { stations } = await (await getStations()).json();
      expect(stations[0].specialtyMissionId).toBe("matching");
      writeDataFile("missions.json", [storedMission({ systemAddress: P0, galaxy: 0, targetSpecialty: "other" })]);
      const unmatched = await (await getStations()).json();
      expect(unmatched.stations[0]).not.toHaveProperty("specialtyMissionId");
    },
  );

  it("limits members without a specialty to their own stations", async () => {
    const noSpecialty = makeMember({ specialty: "" });
    seedMembers([...castMembers(cast), noSpecialty]);
    writeDataFile("stations-v2.json", [
      { portal: P0, galaxy: 0, ownerId: cast.user.publicId },
      { portal: Q0, galaxy: 0, ownerId: noSpecialty.publicId },
    ]);
    signInAs(noSpecialty);
    const { stations } = (await (await getStations()).json()) as { stations: StationView[] };
    expect(stations.map((station) => station.portal)).toEqual([Q0]);
    expect(stations[0].ownerId).toBe(noSpecialty.publicId);
  });

  it("returns 503 when stations cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("stations-v2.json", "{broken");
    signInAs(cast.user);
    expect((await getStations()).status).toBe(503);
  });
});

describe("POST /api/stations", () => {
  it.each([
    ["a malformed body", "{", "stations.error_invalid_portal_and_galaxy"],
    ["a malformed portal", { portal: "XYZ", galaxy: 0 }, "stations.error_invalid_portal_and_galaxy"],
    ["an invalid portal", { portal: "7123456789AB", galaxy: 0 }, "stations.error_invalid_portal_and_galaxy"],
    ["a missing galaxy", { portal: Q0 }, "stations.error_invalid_portal_and_galaxy"],
    ["a galaxy over 255", { portal: Q0, galaxy: 256 }, "stations.error_invalid_portal_and_galaxy"],
    ["a fractional galaxy", { portal: Q0, galaxy: 0.5 }, "stations.error_invalid_portal_and_galaxy"],
    ["a long name", { portal: Q0, galaxy: 0, name: "n".repeat(81) }, "stations.error_station_name_too_long"],
    ["a long note", { portal: Q0, galaxy: 0, note: "n".repeat(1001) }, "stations.error_station_note_too_long"],
  ])("rejects %s", async (_label, body, error) => {
    signInAs(cast.user);
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(storedStations()).toHaveLength(1);
  });

  it("rejects owners that are not approved members", async () => {
    signInAs(cast.moderator);
    for (const ownerId of [cast.pending.publicId, cast.blocked.publicId, "unknown"]) {
      expect((await post({ portal: Q0, galaxy: 0, ownerId })).status).toBe(400);
    }
  });

  it("forbids users and simple-view admins from creating stations for others", async () => {
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      const response = await post({ portal: Q0, galaxy: 0, ownerId: cast.moderator.publicId });
      expect(response.status).toBe(403);
    }
    expect(storedStations()).toHaveLength(1);
  });

  it("saves a member's own station and caches the almanac planet", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const address = new URL(String(input)).pathname.split("/").pop();
      if (address === `1${Q0.slice(1)}`) return new Response("", { status: 404 });
      return Response.json({ portal: Q0.toLowerCase(), lines: {} });
    });
    signInAs(cast.user);
    const response = await post({ portal: Q0.toLowerCase(), galaxy: 7, name: " Outpost ", note: " Water world " });
    expect(response.status).toBe(201);
    const stored = storedStations().find((station) => station.portal === Q0);
    expect(stored).toMatchObject({
      galaxy: 7,
      ownerId: cast.user.publicId,
      name: "Outpost",
      note: "Water world",
      createdByMemberId: cast.user.publicId,
    });
    expect(Date.parse(stored?.createdAt ?? "")).not.toBeNaN();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://nmsalmanac.com/api/planets/${Q0}?galaxy=8`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(readDataFile<Record<string, Record<string, unknown>>>("almanac.json")[Q0]["7"]).toEqual({
      portal: Q0.toLowerCase(),
      lines: {},
    });
    const { stations } = (await response.json()) as { stations: StationView[] };
    expect(stations.map((station) => station.portal)).toContain(Q0);
  });

  it("lets moderators create stations for another member", async () => {
    signInAs(cast.moderator);
    expect((await post({ portal: Q0, galaxy: 0, ownerId: ` ${cast.user.publicId} ` })).status).toBe(201);
    expect(storedStations().find((station) => station.portal === Q0)).toMatchObject({
      ownerId: cast.user.publicId,
      createdByMemberId: cast.moderator.publicId,
    });
  });

  it("returns 409 for an existing portal or another planet of a registered system", async () => {
    writeDataFile("missions.json", [storedMission({ systemAddress: "0125456789AB", galaxy: 1 })]);
    signInAs(cast.moderator);
    const duplicate = await post({ portal: P0, galaxy: 0 });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "stations.this_portal_is_already_in_the_selected_owner_s_list" });
    const sameSystemStation = await post({ portal: P1, galaxy: 0 });
    expect(sameSystemStation.status).toBe(409);
    expect(await sameSystemStation.json()).toEqual({ error: "errors.another_planet_from_system_already_registered" });
    expect((await post({ portal: "2125456789AB", galaxy: 1 })).status).toBe(409);
    expect((await post({ portal: P1, galaxy: 1 })).status).toBe(201);
  });

  it("ignores almanac data that is cached, mismatched or unreachable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    writeDataFile("almanac.json", {
      [Q0]: { 0: { portal: Q0, pictures: { disc: "/planets/cached.jpg" }, lines: { band: {} } } },
    });
    signInAs(cast.moderator);
    expect((await post({ portal: Q0, galaxy: 0 })).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(Response.json({ portal: R0 }));
    expect((await post({ portal: "0126456789AB", galaxy: 0 })).status).toBe(201);
    fetchMock.mockResolvedValue(Response.json(null));
    expect((await post({ portal: "0127456789AB", galaxy: 0 })).status).toBe(201);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await post({ portal: R0, galaxy: 0 })).status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith("Unable to cache station planet from NMS Almanac", expect.any(Error));
    expect(Object.keys(readDataFile<Record<string, unknown>>("almanac.json"))).toEqual([Q0]);
  });

  it("returns 503 when the station cannot be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("stations-v2.json", "{broken");
    signInAs(cast.user);
    expect((await post({ portal: Q0, galaxy: 0 })).status).toBe(503);
  });
});

describe("DELETE /api/stations", () => {
  it("rejects invalid portals and galaxies", async () => {
    signInAs(cast.user);
    for (const body of ["{", { portal: "XYZ", galaxy: 0 }, { portal: P0 }, { portal: P0, galaxy: -1 }]) {
      expect((await remove(body)).status).toBe(400);
    }
  });

  it("rejects owners that are not approved members", async () => {
    signInAs(cast.moderator);
    expect((await remove({ portal: P0, galaxy: 0, ownerId: cast.pending.publicId })).status).toBe(400);
  });

  it("forbids users and simple-view admins from removing someone else's station", async () => {
    const otherUser = makeMember();
    seedMembers([...castMembers(cast), otherUser]);
    for (const member of [otherUser, cast.simpleAdmin]) {
      signInAs(member);
      expect((await remove({ portal: P0, galaxy: 0, ownerId: cast.user.publicId })).status).toBe(403);
    }
    expect(storedStations()).toHaveLength(1);
  });

  it("returns 404 when the owner does not have that station", async () => {
    signInAs(cast.moderator);
    expect((await remove({ portal: P0, galaxy: 0 })).status).toBe(404);
    expect((await remove({ portal: P0, galaxy: 1, ownerId: cast.user.publicId })).status).toBe(404);
  });

  it("returns 409 when a mission uses the station", async () => {
    writeDataFile("missions.json", [storedMission({ systemAddress: P0.toLowerCase(), galaxy: 0 })]);
    signInAs(cast.user);
    expect((await remove({ portal: P0, galaxy: 0 })).status).toBe(409);
    expect(storedStations()).toHaveLength(1);
  });

  it("lets the owner remove their station", async () => {
    signInAs(cast.user);
    const response = await remove({ portal: P0.toLowerCase(), galaxy: 0 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stations: [] });
    expect(storedStations()).toEqual([]);
  });

  it("lets moderators remove any station", async () => {
    signInAs(cast.moderator);
    expect((await remove({ portal: P0, galaxy: 0, ownerId: cast.user.publicId })).status).toBe(200);
    expect(storedStations()).toEqual([]);
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("stations-v2.json", "{broken");
    signInAs(cast.user);
    expect((await remove({ portal: P0, galaxy: 0 })).status).toBe(503);
  });
});

describe("PATCH /api/stations", () => {
  it.each([
    ["a malformed body", "{"],
    ["an array body", []],
    ["a bad current portal", { currentPortal: "XYZ" }],
    ["an invalid current portal", { currentPortal: "7123456789AB" }],
    ["a bad current galaxy", { currentGalaxy: "0" }],
    ["a missing current owner", { currentOwnerId: " " }],
    ["a bad portal", { portal: "XYZ" }],
    ["an invalid portal", { portal: "0FFF56789ABC" }],
    ["a bad galaxy", { galaxy: 300 }],
    ["a missing owner", { ownerId: undefined }],
    ["a long name", { name: "n".repeat(81) }],
    ["a long note", { note: "n".repeat(1001) }],
    ["an unknown field", { createdAt: "2020-01-01" }],
  ])("rejects %s", async (_label, overrides) => {
    signInAs(cast.user);
    const response = await patch(
      typeof overrides === "string" || Array.isArray(overrides) ? overrides : patchBody(overrides),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "stations.error_invalid_station_data" });
  });

  it("rejects owners that are not approved members", async () => {
    signInAs(cast.moderator);
    expect((await patch(patchBody({ ownerId: cast.pending.publicId }))).status).toBe(400);
    expect((await patch(patchBody({ currentOwnerId: "unknown" }))).status).toBe(400);
  });

  it("forbids users and simple-view admins from editing or giving away stations", async () => {
    signInAs(cast.simpleAdmin);
    expect((await patch(patchBody())).status).toBe(403);
    signInAs(cast.user);
    expect((await patch(patchBody({ ownerId: cast.moderator.publicId }))).status).toBe(403);
    expect(storedStations()[0]).toMatchObject({ ownerId: cast.user.publicId, name: "User Base" });
  });

  it("returns 404 when the station is not in the current owner's list", async () => {
    signInAs(cast.moderator);
    expect(
      (await patch(patchBody({ currentOwnerId: cast.moderator.publicId, ownerId: cast.moderator.publicId }))).status,
    ).toBe(404);
  });

  it("lets the owner rename their station, keeping its creation data", async () => {
    signInAs(cast.user);
    const response = await patch(patchBody({ name: " New Name ", note: " note " }));
    expect(response.status).toBe(200);
    expect(storedStations()).toEqual([
      {
        portal: P0,
        galaxy: 0,
        ownerId: cast.user.publicId,
        name: "New Name",
        note: "note",
        createdByMemberId: cast.user.publicId,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://nmsalmanac.com/api/planets/${P1}?galaxy=1`,
      `https://nmsalmanac.com/api/planets/${P0}?galaxy=1`,
    ]);
  });

  it("lets the owner move the station to a free address", async () => {
    signInAs(cast.user);
    expect((await patch(patchBody({ currentPortal: P0.toLowerCase(), portal: Q0, galaxy: 5 }))).status).toBe(200);
    expect(storedStations()[0]).toMatchObject({ portal: Q0, galaxy: 5 });
  });

  it("allows only title edits on stations used by a mission, unless a moderator reassigns the owner", async () => {
    writeDataFile("missions.json", [
      storedMission({ id: "M-1", systemAddress: P0, galaxy: 0, stationOwnerMemberId: cast.user.publicId }),
      storedMission({ id: "M-2", systemAddress: Q0, galaxy: 0, stationOwnerMemberId: cast.user.publicId }),
    ]);
    signInAs(cast.user);
    const moved = await patch(patchBody({ portal: R0 }));
    expect(moved.status).toBe(409);
    expect(await moved.json()).toEqual({ error: "stations.error_station_associated_with_mission_title_only" });
    expect((await patch(patchBody({ galaxy: 1 }))).status).toBe(409);
    expect((await patch(patchBody({ name: "Title only" }))).status).toBe(200);

    signInAs(cast.moderator);
    expect((await patch(patchBody({ portal: R0 }))).status).toBe(409);
    expect((await patch(patchBody({ ownerId: cast.moderator.publicId }))).status).toBe(200);
    expect(storedStations()[0]).toMatchObject({ ownerId: cast.moderator.publicId, name: "Renamed" });
    const missions = readDataFile<{ id: string; stationOwnerMemberId: string }[]>("missions.json");
    expect(missions.find((mission) => mission.id === "M-1")?.stationOwnerMemberId).toBe(cast.moderator.publicId);
    expect(missions.find((mission) => mission.id === "M-2")?.stationOwnerMemberId).toBe(cast.user.publicId);
  });

  it("returns 409 for an occupied portal or another planet of a registered system", async () => {
    writeDataFile("stations-v2.json", [
      { portal: P0, galaxy: 0, ownerId: cast.user.publicId },
      { portal: Q0, galaxy: 0, ownerId: cast.moderator.publicId },
    ]);
    writeDataFile("missions.json", [storedMission({ systemAddress: R0, galaxy: 3 })]);
    signInAs(cast.user);
    expect((await patch(patchBody({ portal: Q0 }))).status).toBe(409);
    expect(await (await patch(patchBody({ portal: "1124456789AB" }))).json()).toEqual({
      error: "errors.another_planet_from_system_already_registered",
    });
    expect((await patch(patchBody({ portal: "1125456789AB", galaxy: 3 }))).status).toBe(409);
    expect((await patch(patchBody({ portal: P1 }))).status).toBe(200);
  });

  it("returns 409 if the station changes before the update", async () => {
    const store = await import("@/lib/stations/stations-store");
    vi.spyOn(store, "updateStationPortal").mockResolvedValue(false);
    signInAs(cast.user);
    expect((await patch(patchBody())).status).toBe(409);
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("stations-v2.json", "{broken");
    signInAs(cast.user);
    expect((await patch(patchBody())).status).toBe(503);
  });
});
