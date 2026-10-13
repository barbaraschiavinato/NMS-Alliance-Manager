import { describe, expect, it } from "vitest";
import { availableMissionSpecialties } from "@/lib/station-mission-availability";
import type { Mission } from "@/lib/missions";

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
