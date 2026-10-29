import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import { PORTAL, SAME_SYSTEM_OTHER_PLANET, corruptDataFile, resetData } from "./fixtures";
import { almanacWords, structuredPlanet, structuredSystem } from "../../helpers/almanac";
import { noteAlmanacRateLimit, resetAlmanacRateLimit } from "@/lib/almanac/almanac-rate-limit";

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
  resetAlmanacRateLimit();
  signInAs(null);
  seedMembers([user, moderator, simpleAdmin]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("GET /api/missions/verify-system", () => {
  it("verifies and caches structured API responses using normalized planet and system labels", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      return Response.json(
        url.includes("/systems/")
          ? structuredSystem
          : url.includes("/words.")
            ? almanacWords
            : { ...structuredPlanet, portal: PORTAL },
      );
    });
    signInAs(user);
    const response = await verify(`address=${PORTAL}&galaxy=0`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      found: true,
      systemLabel: "Yellow · Trading · Low · Gek",
      planetType: "Test World",
      cached: false,
    });
    expect(readCache()[PORTAL]["0"]).toHaveProperty("lines");
  });

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
    ["a system address instead of a portal address", "address=12345678&galaxy=0"],
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

  it("verifies a non-zero-leading portal without using a planet-one fallback", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...almanacPlanet, portal: SAME_SYSTEM_OTHER_PLANET }));
    signInAs(user);

    const res = await verify(`address=${SAME_SYSTEM_OTHER_PLANET}&galaxy=0`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, cached: false, planetType: "Lush" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://nmsalmanac.com/api/planets/${SAME_SYSTEM_OTHER_PLANET}?galaxy=1`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies a zero-leading portal against planet one and caches it for the entered address", async () => {
    const planetOnePortal = `1${PORTAL.slice(1)}`;
    const planetOne = { ...almanacPlanet, portal: planetOnePortal };
    fetchMock.mockResolvedValue(Response.json(planetOne));
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      found: true,
      systemLabel: "Yellow · Trading · Gek",
      planetType: "Lush",
      cached: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://nmsalmanac.com/api/planets/${PORTAL}?galaxy=1`);
    expect(readCache()).toEqual({ [planetOnePortal]: { 0: planetOne }, [PORTAL]: { 0: planetOne } });
  });

  it("uses a cached planet-one response when verifying a zero-leading portal", async () => {
    const planetOnePortal = `1${PORTAL.slice(1)}`;
    const planetOne = { ...almanacPlanet, portal: planetOnePortal };
    writeDataFile("almanac.json", { [planetOnePortal]: { 0: planetOne } });
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, cached: true, planetType: "Lush" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readCache()[PORTAL]["0"]).toMatchObject({ portal: planetOnePortal });
  });

  it("tries planet one when the entered zero-leading portal is not in the Almanac", async () => {
    const planetOnePortal = `1${PORTAL.slice(1)}`;
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json({ ...almanacPlanet, portal: planetOnePortal }));
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, cached: false, planetType: "Lush" });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://nmsalmanac.com/api/planets/${PORTAL}?galaxy=1`,
      `https://nmsalmanac.com/api/planets/${planetOnePortal}?galaxy=1`,
    ]);
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

  it("uses the active Almanac cooldown without making another request", async () => {
    noteAlmanacRateLimit(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the default cooldown when a rate-limited response has no Retry-After", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("maps other Almanac errors to 502", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    signInAs(user);
    const res = await verify(`address=${PORTAL}&galaxy=0`);
    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("forwards Retry-After for other Almanac errors", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503, headers: { "Retry-After": "30" } }));
    signInAs(user);

    const res = await verify(`address=${PORTAL}&galaxy=0`);

    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it.each([
    ["an unexpected payload", () => Promise.resolve(Response.json(["not", "a", "planet"]))],
    ["a response for a different portal", () => Promise.resolve(Response.json({ portal: "FFFFFFFFFFFF" }))],
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
