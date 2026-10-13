import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import { PORTAL, corruptDataFile, resetData } from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { GET } = await import("@/app/api/missions/verify-system/route");

const user = makeMember({ specialty: "explorer" });
const moderator = makeMember({ role: "moderator" });
const simpleAdmin = makeMember({ role: "admin", simpleView: true });
const almanacPlanet = {
  portal: PORTAL,
  lines: {
    headline: { word: " Lush " },
    band: {
      star: { word: "Yellow" },
      economy: { word: " Trading " },
      conflict: { word: "" },
      race: { word: "Gek" },
      type: { word: "Paradise" },
    },
  },
};

const verify = (query: string) => GET(jsonRequest(`/api/missions/verify-system?${query}`, "GET"));
const fetchMock = vi.fn<typeof fetch>();

function readCache() {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "almanac.json"), "utf8"));
}

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([user, moderator, simpleAdmin]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("GET /api/missions/verify-system", () => {
  it("requires a session", async () => {
    expect((await verify(`address=${PORTAL}&galaxy=0`)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await verify(`address=${PORTAL}&galaxy=0`)).status).toBe(401);
  });

  it.each([
    ["a missing address", "galaxy=0"],
    ["a non-hex address", "address=ZZZZZZZZZZZZ&galaxy=0"],
    ["an address with decode errors", "address=0123458000AB&galaxy=0"],
    ["a missing galaxy", `address=${PORTAL}`],
    ["a non-numeric galaxy", `address=${PORTAL}&galaxy=abc`],
    ["a galaxy above 255", `address=${PORTAL}&galaxy=300`],
  ])("rejects %s with 400", async (_label, query) => {
    signInAs(user);
    expect((await verify(query)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["user", user],
    ["moderator", moderator],
    ["simple-view admin", simpleAdmin],
  ])("answers a %s from the cache", async (_label, member) => {
    writeDataFile("almanac.json", { [PORTAL]: { 7: almanacPlanet } });
    signInAs(member);
    const res = await verify(`address=${PORTAL.toLowerCase()}&galaxy=7`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      found: true,
      systemLabel: "Yellow · Trading · Gek",
      planetType: "Lush",
      cached: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies against the Almanac and caches the response", async () => {
    fetchMock.mockResolvedValue(Response.json(almanacPlanet));
    signInAs(user);
    const res = await verify(`address=${PORTAL}&galaxy=7`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      found: true,
      systemLabel: "Yellow · Trading · Gek",
      planetType: "Lush",
      cached: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://nmsalmanac.com/api/planets/${PORTAL}?galaxy=8`);
    expect(readCache()).toEqual({ [PORTAL]: { 7: almanacPlanet } });
  });

  it("falls back to the band type and null labels", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        portal: PORTAL.toLowerCase(),
        lines: { headline: { word: " " }, band: { type: { word: "Barren" } } },
      }),
    );
    signInAs(user);
    expect(await (await verify(`address=${PORTAL}&galaxy=0`)).json()).toEqual({
      found: true,
      systemLabel: null,
      planetType: "Barren",
      cached: false,
    });
  });

  it("returns null labels when the response has no lines", async () => {
    fetchMock.mockResolvedValue(Response.json({ portal: PORTAL }));
    signInAs(user);
    expect(await (await verify(`address=${PORTAL}&galaxy=0`)).json()).toEqual({
      found: true,
      systemLabel: null,
      planetType: null,
      cached: false,
    });
  });

  it("reports an unknown system without caching it", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    signInAs(user);
    const res = await verify(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
    expect(existsSync(path.join(process.cwd(), "data", "almanac.json"))).toBe(false);
  });

  it("forwards rate limiting with Retry-After", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    signInAs(user);
    const res = await verify(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });

  it("maps other Almanac errors to 502", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    signInAs(user);
    const res = await verify(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it.each([
    ["an unexpected payload", () => Promise.resolve(Response.json(["not", "a", "planet"]))],
    ["a network failure", () => Promise.reject(new Error("offline"))],
  ])("returns 502 on %s", async (_label, response) => {
    fetchMock.mockImplementation(response);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(user);
    expect((await verify(`address=${PORTAL}&galaxy=0`)).status).toBe(502);
  });

  it("returns 502 when the cache cannot be read", async () => {
    corruptDataFile("almanac.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(user);
    expect((await verify(`address=${PORTAL}&galaxy=0`)).status).toBe(502);
  });
});
