import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { makeMember, seedMembers } from "../helpers/members";
import * as visitsStore from "@/lib/planets/planet-visits-store";
import {
  PORTAL,
  OTHER_PORTAL,
  THIRD_PORTAL,
  resetData,
  seedMissions,
  seedStations,
  storedMission,
} from "./missions/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const { PATCH } = await import("@/app/api/planet-visits/route");
const explorer = makeMember({ specialty: "explorer" });
const builder = makeMember({ specialty: "builder" });
const ranger = makeMember({ specialty: "ranger" });
const planet = `1${PORTAL.slice(1)}`;
const patch = (body: unknown) => PATCH(jsonRequest("/api/planet-visits", "PATCH", body));
const readVisits = () => JSON.parse(readFileSync(path.join(process.cwd(), "data", "planet-visits.json"), "utf8"));

beforeEach(() => {
  resetData();
  seedMembers([explorer, builder, ranger]);
  seedMissions([
    storedMission({ systemAddress: PORTAL, assignedMemberId: explorer.publicId }),
    storedMission({ systemAddress: OTHER_PORTAL, assignedMemberId: builder.publicId, targetSpecialty: "builder" }),
    storedMission({ systemAddress: PORTAL, assignedMemberId: ranger.publicId, targetSpecialty: "ranger" }),
  ]);
  signInAs(explorer);
});

describe("PATCH /api/planet-visits", () => {
  it("requires an approved session", async () => {
    signInAs(null);
    expect((await patch({ planetPortal: planet, galaxy: 0, visited: true })).status).toBe(401);
    const pending = makeMember({ membershipStatus: "pending" });
    seedMembers([pending]);
    signInAs(pending);
    expect((await patch({ planetPortal: planet, galaxy: 0, visited: true })).status).toBe(401);
  });

  it("marks and unmarks a planet of a system where the member has a mission, in upper case", async () => {
    const response = await patch({ planetPortal: planet.toLowerCase(), galaxy: 0, visited: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ planetPortal: planet, galaxy: 0, visited: true });
    expect(readVisits()).toEqual({ [explorer.publicId]: [`0:${planet}`] });
    await patch({ planetPortal: planet, galaxy: 0, visited: false });
    expect(readVisits()).toEqual({});
  });

  it("keeps the marks of each member separate", async () => {
    await patch({ planetPortal: planet, galaxy: 0, visited: true });
    signInAs(builder);
    await patch({ planetPortal: `2${OTHER_PORTAL.slice(1)}`, galaxy: 0, visited: true });
    expect(readVisits()).toEqual({
      [explorer.publicId]: [`0:${planet}`],
      [builder.publicId]: [`0:2${OTHER_PORTAL.slice(1)}`],
    });
  });

  it.each([
    [
      "a planet of another member's system",
      () => ({ planetPortal: `1${OTHER_PORTAL.slice(1)}`, galaxy: 0, visited: true }),
    ],
    ["another galaxy", () => ({ planetPortal: planet, galaxy: 1, visited: true })],
  ])("refuses %s", async (_label, body) => {
    expect((await patch(body())).status).toBe(403);
  });

  it("refuses rangers who only have a mission", async () => {
    signInAs(ranger);
    expect((await patch({ planetPortal: planet, galaxy: 0, visited: true })).status).toBe(403);
  });

  it("lets the discoverer of the system's station mark its planets, whatever the specialty", async () => {
    seedStations([
      { portal: THIRD_PORTAL, galaxy: 0, ownerId: ranger.publicId },
      { portal: OTHER_PORTAL, galaxy: 0, ownerId: builder.publicId },
    ]);
    signInAs(ranger);
    const rangerPlanet = `2${THIRD_PORTAL.slice(1)}`;
    expect((await patch({ planetPortal: rangerPlanet, galaxy: 0, visited: true })).status).toBe(200);
    expect(readVisits()).toEqual({ [ranger.publicId]: [`0:${rangerPlanet}`] });
    // A station owned by someone else grants nothing.
    expect((await patch({ planetPortal: `1${OTHER_PORTAL.slice(1)}`, galaxy: 0, visited: true })).status).toBe(403);
  });

  it.each([
    null,
    "text",
    {},
    { planetPortal: planet, galaxy: 0 },
    { planetPortal: planet, galaxy: 0, visited: "yes" },
    { planetPortal: "123", galaxy: 0, visited: true },
    { planetPortal: "ZZZZZZZZZZZZ", galaxy: 0, visited: true },
    { planetPortal: planet, galaxy: -1, visited: true },
    { planetPortal: planet, galaxy: 256, visited: true },
    { planetPortal: planet, galaxy: 1.5, visited: true },
    { planetPortal: planet, galaxy: "0", visited: true },
    { planetPortal: 5, galaxy: 0, visited: true },
  ])("rejects invalid input %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
  });

  it("logs non-Error storage failures without exposing them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(visitsStore, "setPlanetVisit").mockRejectedValue("unexpected");
    const response = await patch({ planetPortal: planet, galaxy: 0, visited: true });
    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledWith("Unable to save planet visit", "Unknown error");
  });

  it("rejects malformed JSON and reports storage failures generically", async () => {
    const malformed = new Request("http://localhost:3000/api/planet-visits", {
      method: "PATCH",
      body: "{",
      headers: { "Content-Type": "application/json" },
    });
    expect((await PATCH(malformed)).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    resetData();
    seedMembers([explorer]);
    // A directory in place of the document makes the write fail without exposing details.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(process.cwd(), "data", "planet-visits.json"), { recursive: true });
    seedMissions([storedMission({ systemAddress: PORTAL, assignedMemberId: explorer.publicId })]);
    const response = await patch({ planetPortal: planet, galaxy: 0, visited: true });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("EISDIR");
  });
});
