import { describe, expect, it } from "vitest";
import {
  detailOrigins,
  findMissionStation,
  isSameSystem,
  missionDetailHref,
  parseDetailOrigin,
  parseStationId,
  stationDetailHref,
  stationId,
  contextualDetailHref,
  detailReturnDestination,
  internalDetailDestination,
} from "@/lib/detail-links";

describe("contextual detail navigation", () => {
  it.each(["stations", "missions", "planets", "messages", "help-requests", "taxi"])(
    "retains %s list and detail destinations with encoded query values",
    (section) => {
      for (const source of [`/${section}?search=Pilot%20One%26Two`, `/${section}/record?from=messages`]) {
        const href = contextualDetailHref("/missions/next?from=stations&source=station-card", source);
        expect(detailReturnDestination(href, "/missions")).toBe(source);
        expect(new URL(href, "https://test.invalid").searchParams.get("source")).toBe("station-card");
      }
    },
  );

  it("accepts the exact source length limit and drops context above it without changing the target", () => {
    const source = `/stations?search=${"a".repeat(8192 - "/stations?search=".length)}`;
    expect(source).toHaveLength(8192);
    expect(internalDetailDestination(source)).toBe(source);
    expect(detailReturnDestination(contextualDetailHref("/missions/next", source), "/missions")).toBe(source);
    expect(contextualDetailHref("/missions/next?from=stations", `${source}a`)).toBe("/missions/next?from=stations");
  });

  it("replaces an existing return target rather than adding ambiguous duplicate parameters", () => {
    const href = contextualDetailHref("/missions/next?returnTo=%2Fmissions&from=stations", "/stations?search=Pilot");
    const params = new URL(href, "https://test.invalid").searchParams;
    expect(params.getAll("returnTo")).toEqual(["/stations?search=Pilot"]);
    expect(params.get("from")).toBe("stations");
  });

  it("falls back when the return destination is the deleted path, even with different query parameters", () => {
    expect(
      detailReturnDestination(
        "/missions/current?returnTo=%2Fstations%2Fremoved%3Ffrom%3Dmissions",
        "/stations",
        "/stations/removed",
      ),
    ).toBe("/stations");
    expect(detailReturnDestination("", "/messages")).toBe("/messages");
    expect(contextualDetailHref("/missions/next", "/users")).toBe("/missions/next");
  });

  it("preserves the complete return chain and the station-card layout source", () => {
    const station = "/stations/owner%3A1234567890AB%3A0?from=planets";
    const mission = contextualDetailHref("/missions/one?from=stations&source=station-card", station);
    expect(new URL(mission, "https://test.invalid").searchParams.get("source")).toBe("station-card");
    expect(detailReturnDestination(mission, "/missions")).toBe(station);
    const next = contextualDetailHref("/missions/two?from=missions", mission);
    expect(detailReturnDestination(next, "/missions")).toBe(mission);
    expect(detailReturnDestination(detailReturnDestination(next, "/missions"), "/stations")).toBe(station);
  });

  it("preserves list searches and falls back for direct links or self returns", () => {
    expect(detailReturnDestination(contextualDetailHref("/missions/one", "/stations?search=Pilot"), "/missions")).toBe(
      "/stations?search=Pilot",
    );
    expect(contextualDetailHref("/missions/one?from=missions", "/missions/one?from=stations")).toBe(
      "/missions/one?from=missions",
    );
    expect(detailReturnDestination("/missions/one?returnTo=%2Fmissions%2Fone", "/missions")).toBe("/missions");
    expect(detailReturnDestination("/missions/one", "/missions")).toBe("/missions");
  });

  it.each([
    undefined,
    "",
    "//example.com",
    "https://example.com",
    "/api/messages",
    "/users",
    "/missions/../users",
    "/missions/..",
    "/missions/.",
    "/missions/%2e%2e",
    "/missions/%2Foutside",
    "/missions/one/extra",
    "/missions\\outside",
    "/missions/one\n",
    "/missions/one#hash",
    `/missions/${"x".repeat(8192)}`,
  ])("rejects unsupported return destinations %j", (value) => {
    expect(internalDetailDestination(value)).toBeUndefined();
    const link = `/missions/one?returnTo=${encodeURIComponent(String(value))}`;
    expect(detailReturnDestination(link, "/missions")).toBe("/missions");
  });
});

describe("station detail links", () => {
  const station = { ownerId: "member-id", portal: "1234567890ab", galaxy: 255 };

  it.each(["stations", "planets", "missions", "messages", "taxi"] as const)(
    "encodes the %s origin with a safe return destination",
    (origin) => {
      expect(parseDetailOrigin(origin)).toBe(origin);
      expect(stationDetailHref(station, origin)).toBe(`/stations/member-id%3A1234567890AB%3A255?from=${origin}`);
      expect(detailOrigins[origin].href).toBe(`/${origin}`);
    },
  );

  it.each([undefined, "", "https://example.com", "//example.com", "/planets", "constructor", "__proto__", ["planets"]])(
    "defaults invalid origins to stations: %j",
    (value) => expect(parseDetailOrigin(value)).toBe("stations"),
  );

  it("round-trips composite IDs with canonical uppercase portal codes", () => {
    expect(stationId(station)).toBe("member-id:1234567890AB:255");
    expect(stationDetailHref(station)).toBe("/stations/member-id%3A1234567890AB%3A255");
    expect(stationDetailHref(stationId(station))).toBe("/stations/member-id%3A1234567890AB%3A255");
    expect(parseStationId(stationId(station))).toEqual({ ...station, portal: "1234567890AB" });
    expect(parseStationId(encodeURIComponent(stationId(station)))).toEqual({ ...station, portal: "1234567890AB" });
    expect(parseStationId("member-id:1234567890ab:0")).toEqual({ ...station, portal: "1234567890AB", galaxy: 0 });
  });

  describe("mission detail links", () => {
    it("encodes mission IDs and preserves the section origin", () => {
      expect(missionDetailHref("mission id")).toBe("/missions/mission%20id?from=missions");
      expect(missionDetailHref("mission-id", "stations")).toBe("/missions/mission-id?from=stations");
      expect(missionDetailHref("mission-id", "help")).toBe("/missions/mission-id?from=help");
      expect(parseDetailOrigin("help")).toBe("help");
      expect(detailOrigins.help).toEqual({ href: "/help-requests", label: "details.back_to_help" });
    });

    it("resolves the same exact portal and galaxy as the existing linked-station action", () => {
      const mission = { systemAddress: "1234567890ab", galaxy: 0 };
      const stations = [
        { portal: "1234567890AB", galaxy: 1, ownerId: "wrong-galaxy" },
        { portal: "2234567890AB", galaxy: 0, ownerId: "other-planet" },
        { portal: "1234567890AB", galaxy: 0, ownerId: "first" },
        { portal: "1234567890AB", galaxy: 0, ownerId: "second" },
      ];
      expect(findMissionStation(mission, stations)).toBe(stations[2]);
      expect(findMissionStation(mission, stations.slice(0, 2))).toBeUndefined();
    });
  });

  it.each([
    "",
    "broken",
    ":1234567890AB:0",
    "owner:invalid:0",
    "owner:1234567890AB:-1",
    "owner:1234567890AB:256",
    "owner:1234567890AB:1.5",
    "owner%3A1234567890AB%3A256",
    "owner%253A1234567890AB%253A0",
    "owner%3A1234567890AB%3A0%",
    "owner%3A1234567890AB%3A0%E0%A4",
  ])("rejects invalid composite IDs: %s", (id) => expect(parseStationId(id)).toBeNull());

  it("matches systems by galaxy and the last eleven glyphs only", () => {
    expect(isSameSystem(station, { portal: "0234567890AB", galaxy: 255 })).toBe(true);
    expect(isSameSystem(station, { portal: "1234567890AB", galaxy: 254 })).toBe(false);
    expect(isSameSystem(station, { portal: "1234567890AC", galaxy: 255 })).toBe(false);
  });
});
