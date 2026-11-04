import { describe, expect, it } from "vitest";
import {
  applicableSystemStatuses,
  editableSystemStatusRoles,
  isMissionSystemStatus,
  missionSystemStatuses,
  missionSystemStatusRoles,
  normalizeMissionSystemStatus,
  parsePlanetSystemStatusAuthors,
  parseSystemStatusAuthors,
  planetSystemStatusKey,
  systemProgressCap,
  systemProgressFloor,
  systemStatusCoveredBy,
  systemStatusLockedBy,
} from "@/lib/planets/planet-system-status";

describe("planetSystemStatusKey", () => {
  it("combines galaxy and upper-cased portal", () => {
    expect(planetSystemStatusKey("0123456789ab", 7)).toBe("7:0123456789AB");
  });
});

describe("editableSystemStatusRoles", () => {
  it("lets moderators and admins in extended view edit every role", () => {
    expect(editableSystemStatusRoles({ role: "moderator", specialty: "ranger" })).toBeNull();
    expect(editableSystemStatusRoles({ role: "admin", specialty: "ranger", simpleView: false })).toBeNull();
  });

  it("limits users and simple-view moderators to their specialty", () => {
    expect(editableSystemStatusRoles({ role: "user", specialty: "explorer" })).toEqual(["explorer"]);
    expect(editableSystemStatusRoles({ role: "admin", specialty: "builder", simpleView: true })).toEqual(["builder"]);
  });
});

describe("normalizeMissionSystemStatus", () => {
  it("keeps canonical values", () => {
    for (const status of missionSystemStatuses) expect(normalizeMissionSystemStatus(status)).toBe(status);
  });

  it("maps legacy Italian and English labels", () => {
    expect(normalizeMissionSystemStatus("Stazione Riscattata")).toBe("station_claimed");
    expect(normalizeMissionSystemStatus("Sistema rinominato")).toBe("renamed");
    expect(normalizeMissionSystemStatus("Errore dati")).toBe("data_error");
    expect(normalizeMissionSystemStatus("Bases uploaded")).toBe("bases_uploaded");
    expect(normalizeMissionSystemStatus("Data uploaded")).toBe("data_uploaded");
    expect(normalizeMissionSystemStatus("Buildings built")).toBe("buildings_built");
  });

  it("rejects unknown and non-string values", () => {
    expect(normalizeMissionSystemStatus("unknown")).toBeNull();
    expect(normalizeMissionSystemStatus(42)).toBeNull();
    expect(normalizeMissionSystemStatus(null)).toBeNull();
  });

  it.todo('rejects Object.prototype keys such as "constructor" (currently returns the inherited function)');
});

describe("isMissionSystemStatus", () => {
  it("accepts canonical values only", () => {
    expect(isMissionSystemStatus("mapped")).toBe(true);
    expect(isMissionSystemStatus("Mapped")).toBe(false);
    expect(isMissionSystemStatus(null)).toBe(false);
  });
});

describe("systemProgressFloor", () => {
  it("assigns every status to a role", () => {
    expect(Object.keys(missionSystemStatusRoles).sort()).toEqual([...missionSystemStatuses].sort());
  });

  it("scales completed role statuses up to the cap, ignoring data_error", () => {
    expect(systemProgressFloor([], "explorer")).toBe(0);
    expect(systemProgressFloor(["mapped"], "explorer")).toBe(27);
    expect(systemProgressFloor(["mapped", "planets_classified", "data_uploaded"], "explorer")).toBe(systemProgressCap);
    expect(systemProgressFloor(["mapped", "planets_classified", "data_uploaded", "data_error"], "explorer")).toBe(80);
    expect(systemProgressFloor(["station_claimed"], "ranger")).toBe(20);
    expect(systemProgressFloor(["buildings_built", "mapped"], "builder")).toBe(40);
  });

  it("returns 0 for specialties without statuses", () => {
    expect(systemProgressFloor(["mapped"], "")).toBe(0);
    expect(systemProgressFloor(["mapped"], "other")).toBe(0);
  });
});

describe("applicableSystemStatuses", () => {
  it("keeps every status while the Explorer has not scanned the system", () => {
    expect(applicableSystemStatuses([])).toEqual([...missionSystemStatuses]);
    expect(applicableSystemStatuses(["system_scanned"])).toContain("system_data_uploaded");
  });

  it("drops the Ranger scan and data-upload tasks once the Explorer has scanned", () => {
    const applicable = applicableSystemStatuses(["mapped"]);
    expect(applicable).not.toContain("system_scanned");
    expect(applicable).not.toContain("system_data_uploaded");
    expect(applicable).toContain("station_claimed");
    expect(applicable).toContain("renamed");
  });

  it("excludes the superseded Ranger tasks from the Ranger progress", () => {
    expect(systemProgressFloor(["station_claimed", "renamed"], "ranger")).toBe(40);
    expect(systemProgressFloor(["station_claimed", "renamed", "mapped"], "ranger")).toBe(systemProgressCap);
    expect(systemProgressFloor(["station_claimed", "system_scanned", "mapped"], "ranger")).toBe(40);
  });

  it("excludes only the Explorer scan when the Ranger or discoverer has scanned", () => {
    const statuses = ["system_scanned"] as const;
    expect(systemStatusCoveredBy("mapped", statuses)).toBe("ranger");
    expect(applicableSystemStatuses(statuses)).not.toContain("mapped");
    expect(applicableSystemStatuses(statuses)).toContain("data_uploaded");
    expect(applicableSystemStatuses(statuses)).toContain("system_scanned");
    expect(systemProgressFloor(statuses, "explorer")).toBe(0);
    expect(systemProgressFloor([...statuses, "planets_classified"], "explorer")).toBe(40);
    expect(systemProgressFloor([...statuses, "planets_classified", "data_uploaded"], "explorer")).toBe(80);
    expect(systemProgressFloor(statuses, "ranger")).toBe(20);
  });

  it("does not cover the Explorer scan from a Ranger data upload alone", () => {
    expect(systemStatusCoveredBy("mapped", ["system_data_uploaded"])).toBeNull();
    expect(applicableSystemStatuses(["system_data_uploaded"])).toContain("mapped");
  });

  it("preserves Explorer coverage when both scan flags were saved, avoiding a mutual lock", () => {
    const statuses = ["mapped", "system_scanned"] as const;
    expect(systemStatusCoveredBy("mapped", statuses)).toBeNull();
    expect(systemStatusCoveredBy("system_scanned", statuses)).toBe("explorer");
    expect(systemStatusCoveredBy("system_data_uploaded", statuses)).toBe("explorer");
  });

  it("restores the Explorer scan when the Ranger scan is unchecked", () => {
    expect(systemStatusCoveredBy("mapped", [])).toBeNull();
    expect(systemProgressFloor(["planets_classified"], "explorer")).toBe(27);
  });
});

describe("Ranger task authors", () => {
  it("keeps only valid authors of Ranger tasks", () => {
    expect(parseSystemStatusAuthors(null)).toEqual({});
    expect(parseSystemStatusAuthors([])).toEqual({});
    expect(
      parseSystemStatusAuthors({
        renamed: { memberId: "a", as: "ranger", extra: true },
        mapped: { memberId: "b", as: "ranger" },
        station_claimed: { memberId: "c", as: "builder" },
        system_scanned: null,
      }),
    ).toEqual({ renamed: { memberId: "a", as: "ranger" } });
    expect(
      parsePlanetSystemStatusAuthors({
        "0:0123456789AB": { renamed: { memberId: "a", as: "discoverer" } },
        "0:0456789ABCDE": { mapped: { memberId: "b", as: "ranger" } },
      }),
    ).toEqual({ "0:0123456789AB": { renamed: { memberId: "a", as: "discoverer" } } });
    expect(parsePlanetSystemStatusAuthors("invalid")).toEqual({});
  });

  it("locks a checked task only for members other than its author", () => {
    const authors = { renamed: { memberId: "a", as: "discoverer" as const } };
    expect(systemStatusLockedBy("renamed", ["renamed"], authors, "b")).toBe("discoverer");
    expect(systemStatusLockedBy("renamed", ["renamed"], authors, "a")).toBeNull();
    expect(systemStatusLockedBy("renamed", [], authors, "b")).toBeNull();
    expect(systemStatusLockedBy("station_claimed", ["station_claimed"], authors, "b")).toBeNull();
    expect(systemStatusLockedBy("renamed", ["renamed"], undefined, "b")).toBeNull();
    expect(systemStatusLockedBy("renamed", ["renamed"], authors, undefined)).toBeNull();
  });
});
