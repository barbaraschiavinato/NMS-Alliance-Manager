import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import { PORTAL, corruptDataFile, resetData } from "./fixtures";
import { resetAlmanacRateLimit } from "@/lib/almanac/almanac-rate-limit";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { GET } = await import("@/app/api/missions/planet/route");

const user = makeMember({ specialty: "explorer" });
const moderator = makeMember({ role: "moderator" });
const simpleAdmin = makeMember({ role: "admin", simpleView: true });
const planet = { portal: PORTAL, name: "Eden" };

const lookup = (query: string) => GET(jsonRequest(`/api/missions/planet?${query}`, "GET"));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetAlmanacRateLimit();
  resetData();
  signInAs(null);
  seedMembers([user, moderator, simpleAdmin]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("GET /api/missions/planet", () => {
  it("requires a session", async () => {
    expect((await lookup(`address=${PORTAL}&galaxy=0`)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await lookup(`address=${PORTAL}&galaxy=0`)).status).toBe(401);
  });

  it.each([
    ["a missing address", "galaxy=0"],
    ["a short address", "address=0123&galaxy=0"],
    ["an address with decode errors", "address=F123456789AB&galaxy=0"],
    ["a missing galaxy", `address=${PORTAL}`],
    ["an empty galaxy", `address=${PORTAL}&galaxy=`],
    ["a negative galaxy", `address=${PORTAL}&galaxy=-1`],
    ["a fractional galaxy", `address=${PORTAL}&galaxy=1.5`],
    ["a galaxy above 255", `address=${PORTAL}&galaxy=256`],
  ])("rejects %s with 400", async (_label, query) => {
    signInAs(user);
    expect((await lookup(query)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["user", user],
    ["moderator", moderator],
    ["simple-view admin", simpleAdmin],
  ])("serves a cached planet to a %s without calling the Almanac", async (_label, member) => {
    writeDataFile("almanac.json", { [PORTAL]: { 3: planet } });
    signInAs(member);
    const res = await lookup(`address=${PORTAL.toLowerCase()}&galaxy=3`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ planet });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a missing planet and caches it", async () => {
    fetchMock.mockResolvedValue(Response.json(planet));
    signInAs(user);
    const res = await lookup(`address=${PORTAL}&galaxy=3`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ planet });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://nmsalmanac.com/api/planets/${PORTAL}?galaxy=4`);
    const cache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "almanac.json"), "utf8"));
    expect(cache).toEqual({ [PORTAL]: { 3: planet } });
  });

  it("returns 404 when the Almanac has no planet", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    signInAs(user);
    const res = await lookup(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "planet.no_almanac_details_are_archived_for_this_mission" });
  });

  it("returns Retry-After without repeating errors or requests during an Almanac cooldown", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    signInAs(user);

    const first = await lookup(`address=${PORTAL}&galaxy=0`);
    const second = await lookup(`address=${PORTAL}&galaxy=0`);

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an Almanac error", () => new Response("", { status: 500 })],
    ["an unexpected payload", () => Response.json({ portal: "000000000000" })],
  ])("returns 503 on %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(user);
    const res = await lookup(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "planet.almanac_lookup_failed" });
  });

  it("returns 503 when the cache cannot be read", async () => {
    corruptDataFile("almanac.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(user);
    expect((await lookup(`address=${PORTAL}&galaxy=0`)).status).toBe(503);
  });
});
