import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  OTHER_PORTAL,
  PORTAL,
  THIRD_PORTAL,
  corruptDataFile,
  resetData,
  seedMissions,
  seedStations,
  storedMission,
} from "./missions/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const { GET, PATCH } = await import("@/app/api/planet-status/route");

const explorer = makeMember({ specialty: "explorer" });
const builder = makeMember({ specialty: "builder" });
const ranger = makeMember({ specialty: "ranger" });
const otherRanger = makeMember({ specialty: "ranger" });
const moderator = makeMember({ role: "moderator", specialty: "ranger" });
const admin = makeMember({ role: "admin", specialty: "" });
const simpleAdmin = makeMember({ role: "admin", specialty: "ranger", simpleView: true });
const UNSEEN_PORTAL = "0456789ABCDE";

const get = (query = "") => GET(jsonRequest(`/api/planet-status${query}`, "GET"));
const patch = (body: unknown) => PATCH(jsonRequest("/api/planet-status", "PATCH", body));

function readStatuses() {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "planet-system-status.json"), "utf8"));
}

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([explorer, builder, ranger, otherRanger, moderator, admin, simpleAdmin]);
  seedMissions([
    storedMission({ systemAddress: PORTAL, targetSpecialty: "explorer", assignedMemberId: explorer.publicId }),
    storedMission({ systemAddress: OTHER_PORTAL, targetSpecialty: "builder" }),
  ]);
  seedStations([{ portal: THIRD_PORTAL, galaxy: 0, ownerId: ranger.publicId }]);
  writeDataFile("planet-system-status.json", {
    [`0:${PORTAL}`]: ["mapped"],
    [`0:${OTHER_PORTAL}`]: ["buildings_built"],
    [`0:${THIRD_PORTAL}`]: ["station_claimed"],
    [`0:${UNSEEN_PORTAL}`]: ["renamed"],
  });
});

describe("GET /api/planet-status", () => {
  it("requires a session", async () => {
    expect((await get()).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await get()).status).toBe(401);
  });

  describe("listing", () => {
    it("shows users statuses for visible missions and their own stations", async () => {
      signInAs(ranger);
      expect(await (await get()).json()).toEqual({ planets: { [`0:${THIRD_PORTAL}`]: ["station_claimed"] } });
      signInAs(explorer);
      expect(await (await get()).json()).toEqual({ planets: { [`0:${PORTAL}`]: ["mapped"] } });
      signInAs(builder);
      expect(await (await get()).json()).toEqual({ planets: { [`0:${OTHER_PORTAL}`]: ["buildings_built"] } });
    });

    it.each([
      ["moderator", moderator],
      ["admin", admin],
    ])("shows a %s every status", async (_label, member) => {
      signInAs(member);
      const body = await (await get()).json();
      expect(Object.keys(body.planets)).toHaveLength(4);
    });

    it("treats a simple-view admin as a user", async () => {
      signInAs(simpleAdmin);
      expect(await (await get()).json()).toEqual({ planets: {} });
    });
  });

  describe("single planet", () => {
    it.each([
      ["a missing galaxy", `?portal=${PORTAL}`],
      ["a missing portal", "?galaxy=0"],
      ["an invalid portal", "?portal=XYZ&galaxy=0"],
      ["a portal with decode errors", "?portal=F123456789AB&galaxy=0"],
      ["a non-integer galaxy", `?portal=${PORTAL}&galaxy=1.5`],
      ["a negative galaxy", `?portal=${PORTAL}&galaxy=-1`],
      ["a galaxy above 255", `?portal=${PORTAL}&galaxy=256`],
    ])("rejects %s with 400", async (_label, query) => {
      signInAs(moderator);
      expect((await get(query)).status).toBe(400);
    });

    it("returns the status of a planet with a visible mission", async () => {
      signInAs(explorer);
      const res = await get(`?portal=${PORTAL.toLowerCase()}&galaxy=0`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ systemStatuses: ["mapped"] });
    });

    it("lets explorers and builders see any planet with a station", async () => {
      signInAs(builder);
      expect(await (await get(`?portal=${THIRD_PORTAL}&galaxy=0`)).json()).toEqual({
        systemStatuses: ["station_claimed"],
      });
    });

    it("lets rangers see their own station", async () => {
      signInAs(ranger);
      expect((await get(`?portal=${THIRD_PORTAL}&galaxy=0`)).status).toBe(200);
    });

    it.each([
      ["a ranger for another ranger's station", otherRanger, THIRD_PORTAL],
      ["an explorer for a mission assigned to others", builder, PORTAL],
      ["an explorer for an unknown planet", explorer, UNSEEN_PORTAL],
      ["a simple-view admin", simpleAdmin, UNSEEN_PORTAL],
    ])("forbids %s", async (_label, member, portal) => {
      signInAs(member);
      expect((await get(`?portal=${portal}&galaxy=0`)).status).toBe(403);
    });

    it("forbids a member when the station is in another galaxy", async () => {
      signInAs(ranger);
      expect((await get(`?portal=${THIRD_PORTAL}&galaxy=1`)).status).toBe(403);
    });

    it.each([
      ["moderator", moderator],
      ["admin", admin],
    ])("lets a %s see any planet", async (_label, member) => {
      signInAs(member);
      expect(await (await get(`?portal=${UNSEEN_PORTAL}&galaxy=0`)).json()).toEqual({ systemStatuses: ["renamed"] });
    });

    it("returns an empty list for a planet without statuses", async () => {
      signInAs(moderator);
      expect(await (await get(`?portal=${PORTAL}&galaxy=9`)).json()).toEqual({ systemStatuses: [] });
    });
  });

  it("returns 503 when statuses cannot be read", async () => {
    corruptDataFile("planet-system-status.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(moderator);
    expect((await get()).status).toBe(503);
  });
});

describe("PATCH /api/planet-status", () => {
  it("requires a session", async () => {
    expect((await patch({ portal: PORTAL, galaxy: 0, systemStatuses: [] })).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ role: "moderator", membershipStatus: "pending" })],
    ["blocked", makeMember({ role: "moderator", membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await patch({ portal: PORTAL, galaxy: 0, systemStatuses: [] })).status).toBe(401);
    expect(readStatuses()[`0:${PORTAL}`]).toEqual(["mapped"]);
  });

  it.each([
    ["malformed JSON", "{"],
    ["an array", "[]"],
    ["an invalid portal", { portal: "XYZ", galaxy: 0, systemStatuses: [] }],
    ["a non-integer galaxy", { portal: PORTAL, galaxy: 0.5, systemStatuses: [] }],
    ["a galaxy above 255", { portal: PORTAL, galaxy: 256, systemStatuses: [] }],
    ["statuses not in an array", { portal: PORTAL, galaxy: 0, systemStatuses: "mapped" }],
    ["an unknown status", { portal: PORTAL, galaxy: 0, systemStatuses: ["flying"] }],
    ["duplicate statuses", { portal: PORTAL, galaxy: 0, systemStatuses: ["mapped", "mapped"] }],
    ["extra fields", { portal: PORTAL, galaxy: 0, systemStatuses: [], note: "x" }],
  ])("rejects %s with 400", async (_label, body) => {
    signInAs(moderator);
    expect((await patch(body)).status).toBe(400);
  });

  it.each([
    ["moderator", moderator],
    ["admin", admin],
  ])("lets a %s set any status", async (_label, member) => {
    signInAs(member);
    const res = await patch({
      portal: UNSEEN_PORTAL.toLowerCase(),
      galaxy: 0,
      systemStatuses: ["mapped", "buildings_built", "station_claimed"],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      portal: UNSEEN_PORTAL,
      galaxy: 0,
      systemStatuses: ["mapped", "buildings_built", "station_claimed"],
    });
    expect(readStatuses()[`0:${UNSEEN_PORTAL}`]).toEqual(["mapped", "buildings_built", "station_claimed"]);
  });

  it("lets an assignee change the statuses of their group", async () => {
    signInAs(explorer);
    const res = await patch({
      portal: PORTAL,
      galaxy: 0,
      systemStatuses: ["mapped", "planets_classified", "data_uploaded"],
    });
    expect(res.status).toBe(200);
    expect(readStatuses()[`0:${PORTAL}`]).toEqual(["mapped", "planets_classified", "data_uploaded"]);
  });

  it("lets an assignee remove a status of their group", async () => {
    signInAs(explorer);
    expect((await patch({ portal: PORTAL, galaxy: 0, systemStatuses: [] })).status).toBe(200);
    expect(readStatuses()[`0:${PORTAL}`]).toEqual([]);
  });

  it("forbids an assignee from changing another group's statuses", async () => {
    signInAs(explorer);
    const res = await patch({ portal: PORTAL, galaxy: 0, systemStatuses: ["mapped", "buildings_built"] });
    expect(res.status).toBe(403);
    expect(readStatuses()[`0:${PORTAL}`]).toEqual(["mapped"]);
  });

  it("lets a station owner change ranger statuses whatever their specialty", async () => {
    seedStations([{ portal: THIRD_PORTAL, galaxy: 0, ownerId: builder.publicId }]);
    signInAs(builder);
    const res = await patch({
      portal: THIRD_PORTAL,
      galaxy: 0,
      systemStatuses: ["station_claimed", "renamed", "buildings_built"],
    });
    expect(res.status).toBe(200);
    expect(readStatuses()[`0:${THIRD_PORTAL}`]).toEqual(["station_claimed", "renamed", "buildings_built"]);
  });

  it("forbids a station owner from changing other groups' statuses", async () => {
    signInAs(ranger);
    expect(
      (await patch({ portal: THIRD_PORTAL, galaxy: 0, systemStatuses: ["station_claimed", "mapped"] })).status,
    ).toBe(403);
  });

  it.each([
    ["a member without assignment or station", builder, PORTAL],
    ["a ranger on another ranger's station", otherRanger, THIRD_PORTAL],
    ["a simple-view admin", simpleAdmin, UNSEEN_PORTAL],
  ])("forbids %s", async (_label, member, portal) => {
    signInAs(member);
    expect((await patch({ portal, galaxy: 0, systemStatuses: ["station_claimed"] })).status).toBe(403);
  });

  it("forbids an assignee in another galaxy", async () => {
    signInAs(explorer);
    expect((await patch({ portal: PORTAL, galaxy: 1, systemStatuses: ["mapped"] })).status).toBe(403);
  });

  it("returns 503 when statuses cannot be saved", async () => {
    corruptDataFile("planet-system-status.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(moderator);
    expect((await patch({ portal: PORTAL, galaxy: 0, systemStatuses: [] })).status).toBe(503);
  });
});
