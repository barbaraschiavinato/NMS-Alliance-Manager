import { describe, expect, it } from "vitest";
import { serializeMission } from "@/lib/missions/mission-view";
import type { Mission } from "@/lib/missions/missions";
import { makeMember } from "../helpers/members";

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "m1",
    title: "Mission",
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

describe("serializeMission", () => {
  const creator = makeMember({ publicId: "creator", nmsName: "CreatorNms", name: "Creator" });
  const owner = makeMember({ publicId: "owner", nmsName: "", name: "Owner Google" });
  const assignee = makeMember({ publicId: "assignee", nmsName: "AssigneeNms" });
  const members = [creator, owner, assignee];

  it("resolves names of referenced members when stored names are missing", () => {
    const result = serializeMission(
      makeMission({
        createdByMemberId: "creator",
        stationOwnerMemberId: "owner",
        assignedMemberId: "assignee",
      }),
      members,
    );
    expect(result).toMatchObject({
      createdByName: "CreatorNms",
      createdByMemberId: "creator",
      stationOwnerName: "Owner Google",
      stationOwnerMemberId: "owner",
      assignedTo: "AssigneeNms",
      assignedMemberId: "assignee",
    });
  });

  it("keeps stored names that are not email addresses", () => {
    const result = serializeMission(
      makeMission({
        createdByName: " Stored Creator ",
        createdByMemberId: "creator",
        assignedTo: "Stored Assignee",
        assignedMemberId: "assignee",
      }),
      members,
    );
    expect(result.createdByName).toBe("Stored Creator");
    expect(result.assignedTo).toBe("Stored Assignee");
  });

  it("never exposes email addresses as names", () => {
    const result = serializeMission(
      makeMission({
        createdByName: "creator@example.com",
        createdByMemberId: "creator",
        stationOwnerName: "owner@example.com",
        assignedTo: "gone@example.com",
        assignedMemberId: "missing",
      }),
      [creator, makeMember({ publicId: "x" })],
    );
    expect(result.createdByName).toBe("CreatorNms");
    expect(result.stationOwnerName).toBe("Former member");
    expect(result.assignedTo).toBe("Former member");
  });

  it("does not use a member's email-like name as fallback", () => {
    const emailNamed = makeMember({ publicId: "creator", nmsName: "", name: "creator@example.com" });
    const result = serializeMission(makeMission({ createdByMemberId: "creator" }), [emailNamed]);
    expect(result.createdByName).toBe("");
  });

  it("labels assignments to removed members as former members", () => {
    const result = serializeMission(makeMission({ assignedMemberId: "missing" }), members);
    expect(result.assignedTo).toBe("Former member");
    expect(result.assignedMemberId).toBe("missing");
  });

  it("keeps unknown member ids and empty names for unreferenced fields", () => {
    const result = serializeMission(
      makeMission({ createdByMemberId: "missing", stationOwnerMemberId: "gone" }),
      members,
    );
    expect(result).toMatchObject({
      createdByName: "",
      createdByMemberId: "missing",
      stationOwnerName: "",
      stationOwnerMemberId: "gone",
      assignedTo: "",
      assignedMemberId: undefined,
    });
  });

  it("does not modify the original mission", () => {
    const mission = makeMission({ createdByName: "gone@example.com" });
    serializeMission(mission, []);
    expect(mission.createdByName).toBe("gone@example.com");
  });

  it("preserves the other mission fields", () => {
    const mission = makeMission({ title: "Keep", progress: 40, status: "in_progress" });
    expect(serializeMission(mission, [])).toMatchObject({
      id: "m1",
      title: "Keep",
      progress: 40,
      status: "in_progress",
    });
  });
});
