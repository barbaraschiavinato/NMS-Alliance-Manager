import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, resetData, writeRawDataFile, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;

function message(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    senderMemberId: cast.admin.publicId,
    recipientMemberId: cast.user.publicId,
    subject: "Subject",
    body: "Body",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("private-messages.json", [
    message({ unread: true }),
    message({ unread: true }),
    message({ unread: false }),
    message({ unread: true, recipientMemberId: cast.moderator.publicId }),
    message({ subjectType: "help", recipientMemberId: undefined }),
    message({ subjectType: "help", recipientMemberId: undefined, archived: true }),
    message({ subjectType: "taxi", recipientMemberId: undefined }),
    message({ subjectType: "taxi", recipientMemberId: undefined }),
  ]);
  writeDataFile("farms.json", []);
  writeDataFile("pets.json", []);
});

async function getCounts() {
  const { GET } = await import("@/app/api/sidebar-counts/route");
  return GET();
}

describe("GET /api/sidebar-counts", () => {
  it("returns 401 without an approved member", async () => {
    signInAs(null);
    expect((await getCounts()).status).toBe(401);
    signInAs(cast.pending);
    expect((await getCounts()).status).toBe(401);
  });

  it("counts unread messages for the member and open help and taxi requests, without farms and pets", async () => {
    signInAs(cast.user);
    const response = await getCounts();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ unread: 2, help: 1, taxi: 2 });
  });

  it("adds the farm and pet totals for staff, but not in simple view", async () => {
    const farms = await import("@/lib/farms/farms-store");
    const pets = await import("@/lib/pets/pets-store");
    vi.spyOn(farms, "readFarms").mockResolvedValue([{}, {}, {}] as Awaited<ReturnType<typeof farms.readFarms>>);
    vi.spyOn(pets, "readPets").mockResolvedValue([{}] as Awaited<ReturnType<typeof pets.readPets>>);
    signInAs(cast.moderator);
    expect(await (await getCounts()).json()).toEqual({ unread: 1, help: 1, taxi: 2, farms: 3, pets: 1 });
    signInAs(cast.simpleAdmin);
    expect(await (await getCounts()).json()).toEqual({ unread: 0, help: 1, taxi: 2 });
  });

  it("returns null for the counters it cannot compute", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeRawDataFile("private-messages.json", "{broken");
    writeRawDataFile("farms.json", "{broken");
    signInAs(cast.admin);
    const response = await getCounts();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unread: null, help: null, taxi: null, farms: null, pets: 0 });
    expect(errors).toHaveBeenCalled();
  });
});
