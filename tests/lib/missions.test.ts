import { describe, expect, it } from "vitest";
import {
  canViewMission,
  coveredSpecialties,
  decodePortalAddress,
  isDifferentPlanetInSameSystem,
  isMissionInput,
  isMissionPriority,
  isMissionStatus,
  normalizeMissionPriority,
  normalizeMissionStatus,
  portalSearchMatches,
  specialtyAlreadyCovered,
  type Mission,
  type MissionViewer,
} from "@/lib/missions";

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "m1",
    title: "Claim station",
    description: "",
    system: "Sol",
    systemAddress: "0123456789AB",
    galaxy: 0,
    assignedTo: "",
    targetSpecialty: "all",
    dueDate: "",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  const { id: _id, ...input } = makeMission();
  void _id;
  return { ...input, ...overrides };
}

describe("normalizeMissionStatus", () => {
  it("keeps current values", () => {
    expect(normalizeMissionStatus("in_progress")).toBe("in_progress");
    expect(normalizeMissionStatus("pending")).toBe("pending");
    expect(normalizeMissionStatus("completed")).toBe("completed");
  });

  it("maps legacy Italian and English labels", () => {
    expect(normalizeMissionStatus("In corso")).toBe("in_progress");
    expect(normalizeMissionStatus("In attesa")).toBe("pending");
    expect(normalizeMissionStatus("Completata")).toBe("completed");
    expect(normalizeMissionStatus("In progress")).toBe("in_progress");
    expect(normalizeMissionStatus("Pending")).toBe("pending");
    expect(normalizeMissionStatus("Completed")).toBe("completed");
  });

  it("rejects unknown and non-string values", () => {
    expect(normalizeMissionStatus("done")).toBeNull();
    expect(normalizeMissionStatus(1)).toBeNull();
    expect(normalizeMissionStatus(undefined)).toBeNull();
  });

  it.todo('rejects Object.prototype keys such as "toString" (currently returns the inherited function)');
});

describe("normalizeMissionPriority", () => {
  it("keeps current values and maps legacy labels", () => {
    expect(normalizeMissionPriority("urgent")).toBe("urgent");
    expect(normalizeMissionPriority("Urgente")).toBe("urgent");
    expect(normalizeMissionPriority("Alta")).toBe("high");
    expect(normalizeMissionPriority("Normale")).toBe("normal");
    expect(normalizeMissionPriority("Urgent")).toBe("urgent");
    expect(normalizeMissionPriority("High")).toBe("high");
    expect(normalizeMissionPriority("Normal")).toBe("normal");
  });

  it("rejects unknown and non-string values", () => {
    expect(normalizeMissionPriority("low")).toBeNull();
    expect(normalizeMissionPriority(null)).toBeNull();
  });

  it.todo('rejects Object.prototype keys such as "constructor" (currently returns the inherited function)');
});

describe("type guards", () => {
  it("isMissionStatus accepts only canonical statuses", () => {
    expect(isMissionStatus("completed")).toBe(true);
    expect(isMissionStatus("Completed")).toBe(false);
    expect(isMissionStatus(3)).toBe(false);
  });

  it("isMissionPriority accepts only canonical priorities", () => {
    expect(isMissionPriority("high")).toBe(true);
    expect(isMissionPriority("Alta")).toBe(false);
    expect(isMissionPriority({})).toBe(false);
  });
});

describe("coveredSpecialties", () => {
  it("expands grouped specialties", () => {
    expect(coveredSpecialties("all")).toEqual(["builder", "ranger", "explorer"]);
    expect(coveredSpecialties("explorer_builder")).toEqual(["builder", "explorer"]);
    expect(coveredSpecialties("ranger")).toEqual(["ranger"]);
    expect(coveredSpecialties("other")).toEqual(["other"]);
  });
});

describe("specialtyAlreadyCovered", () => {
  const missions = [
    makeMission({ id: "a", systemAddress: "0123456789ab", galaxy: 1, targetSpecialty: "explorer_builder" }),
    makeMission({ id: "b", systemAddress: "0123456789AB", galaxy: 2, targetSpecialty: "ranger" }),
  ];

  it("detects overlaps in the same system and galaxy, ignoring address case", () => {
    expect(specialtyAlreadyCovered("builder", missions, "0123456789AB", 1)).toBe(true);
    expect(specialtyAlreadyCovered("all", missions, "0123456789AB", 1)).toBe(true);
    expect(specialtyAlreadyCovered("ranger", missions, "0123456789AB", 1)).toBe(false);
  });

  it("ignores other galaxies and other systems", () => {
    expect(specialtyAlreadyCovered("explorer", missions, "0123456789AB", 2)).toBe(false);
    expect(specialtyAlreadyCovered("explorer", missions, "1123456789AB", 1)).toBe(false);
  });

  it("excludes the mission being edited", () => {
    expect(specialtyAlreadyCovered("builder", missions, "0123456789AB", 1, "a")).toBe(false);
  });
});

describe("canViewMission", () => {
  const explorer: MissionViewer = { publicId: "p1", email: "e@x.it", name: "E", specialty: "explorer" };

  it("shows unassigned missions matching the viewer specialty", () => {
    expect(canViewMission(makeMission({ targetSpecialty: "all" }), explorer)).toBe(true);
    expect(canViewMission(makeMission({ targetSpecialty: "explorer" }), explorer)).toBe(true);
    expect(canViewMission(makeMission({ targetSpecialty: "explorer_builder" }), explorer)).toBe(true);
    expect(
      canViewMission(makeMission({ targetSpecialty: "explorer_builder" }), { ...explorer, specialty: "builder" }),
    ).toBe(true);
  });

  it("hides missions for other specialties", () => {
    expect(canViewMission(makeMission({ targetSpecialty: "ranger" }), explorer)).toBe(false);
    expect(
      canViewMission(makeMission({ targetSpecialty: "explorer_builder" }), { ...explorer, specialty: "ranger" }),
    ).toBe(false);
  });

  it("shows assigned missions only to the assignee", () => {
    expect(canViewMission(makeMission({ assignedMemberId: "p1", assignedTo: "E" }), explorer)).toBe(true);
    expect(canViewMission(makeMission({ assignedMemberId: "p2", assignedTo: "Other" }), explorer)).toBe(false);
    expect(canViewMission(makeMission({ assignedMemberId: " ", assignedTo: "Legacy name" }), explorer)).toBe(false);
  });

  it("hides assigned missions from viewers without publicId", () => {
    const { publicId: _publicId, ...anonymous } = explorer;
    void _publicId;
    expect(canViewMission(makeMission({ assignedMemberId: "p1" }), anonymous)).toBe(false);
  });
});

describe("decodePortalAddress", () => {
  it("returns null for malformed addresses", () => {
    expect(decodePortalAddress("")).toBeNull();
    expect(decodePortalAddress("0123456789A")).toBeNull();
    expect(decodePortalAddress("0123456789AG")).toBeNull();
    expect(decodePortalAddress("0123-456789AB")).toBeNull();
  });

  it("decodes fields and signed coordinates", () => {
    expect(decodePortalAddress("1abcFF7FF801")).toEqual({
      kind: "portal",
      planet: 1,
      systemIndex: 0xabc,
      y: -1,
      z: 0x7ff,
      x: -2047,
      errors: [],
    });
    expect(decodePortalAddress("000101001001")).toMatchObject({ y: 1, z: 1, x: 1, errors: [] });
  });

  it("reports every invalid field", () => {
    expect(decodePortalAddress("7FFF80000800")?.errors).toEqual([
      "Planet index 7: allowed range is 0–6.",
      "System index FFF is reserved.",
      "Y coordinate 80: unused value.",
      "Z coordinate 000: unused value.",
      "X coordinate 800: unused value.",
    ]);
    expect(decodePortalAddress("000100800000")?.errors).toEqual([
      "Z coordinate 800: unused value.",
      "X coordinate 000: unused value.",
    ]);
  });
});

describe("portalSearchMatches", () => {
  it("matches substrings ignoring spaces, dashes and case", () => {
    expect(portalSearchMatches("0123-4567-89AB", "45 67")).toBe(true);
    expect(portalSearchMatches("0123456789AB", "89ab")).toBe(true);
    expect(portalSearchMatches("0123456789AB", "FFFF")).toBe(false);
  });

  it("never matches an empty search", () => {
    expect(portalSearchMatches("0123456789AB", " - ")).toBe(false);
  });

  it("matches other planets of the same system on a full address", () => {
    expect(portalSearchMatches("1123456789AB", "0123456789AB")).toBe(true);
    expect(portalSearchMatches("1123456789AB", "0123456789AC")).toBe(false);
    expect(portalSearchMatches("1123456789", "0123456789AB")).toBe(false);
  });
});

describe("isDifferentPlanetInSameSystem", () => {
  it("is true only for a different planet index in the same system and galaxy", () => {
    expect(isDifferentPlanetInSameSystem("0123456789ab", 3, "1123456789AB", 3)).toBe(true);
    expect(isDifferentPlanetInSameSystem("0123456789AB", 3, "0123456789ab", 3)).toBe(false);
    expect(isDifferentPlanetInSameSystem("0123456789AB", 3, "1123456789AC", 3)).toBe(false);
    expect(isDifferentPlanetInSameSystem("0123456789AB", 3, "1123456789AB", 4)).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isDifferentPlanetInSameSystem("bad", 0, "1123456789AB", 0)).toBe(false);
    expect(isDifferentPlanetInSameSystem("0123456789AB", 0, "bad", 0)).toBe(false);
  });
});

describe("isMissionInput", () => {
  it("accepts a minimal valid input and all optional fields", () => {
    expect(isMissionInput(validInput())).toBe(true);
    expect(
      isMissionInput(
        validInput({
          notes: "n".repeat(1000),
          systemVerified: true,
          systemLabelFromAlmanac: false,
          createdByName: "c".repeat(80),
          createdByMemberId: "id",
          stationOwnerName: "Owner",
          stationOwnerMemberId: "owner",
          assignedMemberId: "assignee",
          galaxy: 255,
          progress: 100,
          title: "t".repeat(120),
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isMissionInput(null)).toBe(false);
    expect(isMissionInput("mission")).toBe(false);
  });

  it.each([
    ["missing title", { title: undefined }],
    ["blank title", { title: "   " }],
    ["long title", { title: "t".repeat(121) }],
    ["non-string description", { description: 1 }],
    ["non-string notes", { notes: 1 }],
    ["long notes", { notes: "n".repeat(1001) }],
    ["non-string system", { system: null }],
    ["non-string address", { systemAddress: 123 }],
    ["malformed address", { systemAddress: "XYZ" }],
    ["address with errors", { systemAddress: "7123456789AB" }],
    ["non-number galaxy", { galaxy: "1" }],
    ["fractional galaxy", { galaxy: 1.5 }],
    ["negative galaxy", { galaxy: -1 }],
    ["galaxy above 255", { galaxy: 256 }],
    ["non-boolean systemVerified", { systemVerified: "yes" }],
    ["non-boolean systemLabelFromAlmanac", { systemLabelFromAlmanac: 1 }],
    ["non-string createdByName", { createdByName: 1 }],
    ["long createdByName", { createdByName: "c".repeat(81) }],
    ["non-string createdByMemberId", { createdByMemberId: 1 }],
    ["non-string stationOwnerName", { stationOwnerName: 1 }],
    ["long stationOwnerName", { stationOwnerName: "s".repeat(81) }],
    ["non-string stationOwnerMemberId", { stationOwnerMemberId: 1 }],
    ["non-string assignedTo", { assignedTo: undefined }],
    ["non-string assignedMemberId", { assignedMemberId: 1 }],
    ["legacy createdByEmail", { createdByEmail: "a@b.it" }],
    ["legacy assignedEmail", { assignedEmail: "a@b.it" }],
    ["unknown specialty", { targetSpecialty: "pilot" }],
    ["non-string dueDate", { dueDate: 0 }],
    ["legacy status", { status: "Completed" }],
    ["legacy priority", { priority: "Alta" }],
    ["non-number progress", { progress: "10" }],
    ["fractional progress", { progress: 10.5 }],
    ["negative progress", { progress: -1 }],
    ["progress above 100", { progress: 101 }],
    ["derived systemStatus", { systemStatus: [] }],
  ])("rejects %s", (_label, overrides) => {
    expect(isMissionInput(validInput(overrides))).toBe(false);
  });
});
