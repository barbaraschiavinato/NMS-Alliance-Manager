import { describe, expect, it } from "vitest";
import { availableMissionSpecialties, stationHasMissionOpportunity } from "@/lib/missions/station-mission-availability";
import type { Mission } from "@/lib/missions/missions";

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "mission-1",
    title: "Survey",
    description: "",
    system: "",
    systemAddress: "1234567890AB",
    galaxy: 0,
    assignedTo: "",
    targetSpecialty: "explorer_builder",
    dueDate: "",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

describe("availableMissionSpecialties", () => {
  it("keeps the specialties covered by combined and all-specialty missions unavailable", () => {
    expect(availableMissionSpecialties([mission()], "1234567890AB", 0)).toEqual(["ranger", "other"]);
    expect(availableMissionSpecialties([mission({ targetSpecialty: "all" })], "1234567890AB", 0)).toEqual(["other"]);
  });

  it("does not let missions from another address or galaxy affect availability", () => {
    expect(
      availableMissionSpecialties(
        [
          mission(),
          mission({ id: "other-galaxy", galaxy: 1 }),
          mission({ id: "other-system", systemAddress: "2234567890AB" }),
        ],
        "1234567890AB",
        0,
      ),
    ).toEqual(["ranger", "other"]);
  });
});

describe("stationHasMissionOpportunity", () => {
  const station = { portal: "1234567890AB", galaxy: 0, ownerId: "owner" };
  const member = (specialty: string, publicId = "me") =>
    ({ publicId, specialty }) as Parameters<typeof stationHasMissionOpportunity>[2];

  it("is true for explorers and builders while their specialty is still missing at the station", () => {
    const taken = mission({
      targetSpecialty: "builder",
      assignedMemberId: "x",
      assignedTo: "X",
      status: "in_progress",
    });
    expect(stationHasMissionOpportunity(station, [], member("explorer"), false)).toBe(true);
    expect(stationHasMissionOpportunity(station, [taken], member("explorer"), false)).toBe(true);
    expect(stationHasMissionOpportunity(station, [taken], member("builder"), false)).toBe(false);
  });

  it("is true when a free mission of the member's specialty is waiting, and false once it is taken or finished", () => {
    const covered = mission({ targetSpecialty: "explorer" });
    expect(stationHasMissionOpportunity(station, [covered], member("explorer"), false)).toBe(true);
    for (const taken of [
      { assignedMemberId: "someone" },
      { assignedTo: "Someone" },
      { status: "in_progress" as const },
      { status: "completed" as const },
    ]) {
      expect(stationHasMissionOpportunity(station, [{ ...covered, ...taken }], member("explorer"), false)).toBe(false);
    }
  });

  it("lets rangers create missions only on their own stations while explorer or builder work is missing", () => {
    expect(stationHasMissionOpportunity(station, [], member("ranger"), false)).toBe(false);
    expect(stationHasMissionOpportunity(station, [], member("ranger", "owner"), false)).toBe(true);
    expect(
      stationHasMissionOpportunity(station, [mission({ targetSpecialty: "all" })], member("ranger", "owner"), false),
    ).toBe(false);
  });

  it("is true for managers on any station that can still take a mission, and false for members without a specialty", () => {
    expect(stationHasMissionOpportunity(station, [], member(""), true)).toBe(true);
    expect(stationHasMissionOpportunity(station, [], member(""), false)).toBe(false);
  });
});
