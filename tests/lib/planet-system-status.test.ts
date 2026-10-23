import { describe, expect, it } from "vitest";
import {
  editableSystemStatusRoles,
  isMissionSystemStatus,
  missionSystemStatuses,
  missionSystemStatusRoles,
  normalizeMissionSystemStatus,
  planetSystemStatusKey,
  systemProgressCap,
  systemProgressFloor,
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
    expect(systemProgressFloor(["station_claimed"], "ranger")).toBe(40);
    expect(systemProgressFloor(["buildings_built", "mapped"], "builder")).toBe(40);
  });

  it("returns 0 for specialties without statuses", () => {
    expect(systemProgressFloor(["mapped"], "")).toBe(0);
    expect(systemProgressFloor(["mapped"], "other")).toBe(0);
  });
});
