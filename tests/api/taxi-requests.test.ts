import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { defaultAlliance, seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, readDataFile, resetData, type Cast } from "./helpers/fixtures";
import { DELETE, GET, POST } from "@/app/api/taxi-requests/route";
import { after } from "next/server";
import { notifyTaxi } from "@/lib/notifications/taxi-notification-delivery";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/notifications/taxi-notification-delivery", () => ({ notifyTaxi: vi.fn() }));

const url = "/api/taxi-requests";
let cast: Cast;
const portal = "0123456789AB";
const get = (query = "") => GET(new Request(`http://localhost:3000${url}${query}`));
const post = (body: unknown) => POST(jsonRequest(url, "POST", body));
const remove = (id: string) => DELETE(jsonRequest(url, "DELETE", { id }));
const stored = () => readDataFile<Record<string, unknown>[]>("private-messages.json");
const taxi = (overrides: Record<string, unknown> = {}) => ({
  id: "taxi-1",
  senderMemberId: cast.user.publicId,
  body: "A ride please",
  galaxy: 9,
  subject: "Eissentam",
  subjectType: "taxi",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.mocked(after).mockClear();
  vi.mocked(notifyTaxi).mockClear();
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("private-messages.json", []);
});

describe("taxi requests", () => {
  it("preserves a successful save when notification scheduling fails", async () => {
    signInAs(cast.user);
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("No request context");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ message: "Ride", galaxy: 0 })).status).toBe(201);
    expect(stored()).toHaveLength(1);
  });
  it("schedules alerts only after saving valid requests and replies", async () => {
    signInAs(cast.user);
    expect((await post({ message: "", galaxy: 0 })).status).toBe(400);
    expect(after).not.toHaveBeenCalled();
    expect((await post({ message: "Ride", galaxy: 0 })).status).toBe(201);
    const id = stored()[0].id;
    expect(after).toHaveBeenCalledOnce();
    expect(notifyTaxi).not.toHaveBeenCalled();
    const callback = vi.mocked(after).mock.calls[0][0];
    if (typeof callback === "function") await callback();
    expect(notifyTaxi).toHaveBeenCalledWith(id, cast.user.publicId, false);
    expect((await post({ message: "On my way", replyToId: id })).status).toBe(201);
    const replyCallback = vi.mocked(after).mock.calls[1][0];
    if (typeof replyCallback === "function") await replyCallback();
    expect(notifyTaxi).toHaveBeenCalledWith(id, cast.user.publicId, true);
  });
  it.each(["user", "moderator", "admin"] as const)(
    "requires a friend code to create taxi requests even for %s",
    async (role) => {
      cast[role] = { ...cast[role], nmsCode: "" };
      seedMembers(castMembers(cast));
      signInAs(cast[role]);
      const response = await post({ message: "Ride", galaxy: 0 });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "taxi.friend_code_required" });
      expect(stored()).toEqual([]);
      writeDataFile("private-messages.json", [taxi()]);
      expect((await get()).status).toBe(200);
      expect((await post({ message: "I can help", replyToId: "taxi-1" })).status).toBe(201);
    },
  );
  it("resolves the hub from alliance configuration and retains the saved address after configuration changes", async () => {
    seedMembers(castMembers(cast), { ...defaultAlliance, portalCode: "1123456789AB", galaxy: 9 });
    signInAs(cast.user);
    expect(
      (
        await post({
          message: "From hub",
          galaxy: 0,
          meetingPoint: "hub",
          meetingStation: { portal, galaxy: 100, name: "forged" },
        })
      ).status,
    ).toBe(201);
    expect(stored()[0]).toMatchObject({
      meetingPoint: "hub",
      meetingStation: { portal: "1123456789AB", galaxy: 9 },
    });
    seedMembers(castMembers(cast), defaultAlliance);
    expect((await (await get()).json())[0].meetingStation).toEqual({ portal: "1123456789AB", galaxy: 9 });
  });

  it("rejects an unconfigured hub", async () => {
    signInAs(cast.user);
    const response = await post({ message: "Ride", galaxy: 0, meetingPoint: "hub" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "taxi.hub_unavailable" });
    expect(stored()).toEqual([]);
  });
  it.each(["offline", "arrange"])("persists and displays non-station meeting point %s", async (meetingPoint) => {
    signInAs(cast.user);
    expect((await post({ message: "Ride", galaxy: 9, meetingPoint })).status).toBe(201);
    expect(stored()[0]).toHaveProperty("meetingPoint", meetingPoint);
    expect((await (await get()).json())[0].meetingPoint).toBe(meetingPoint);
  });

  it.each([
    { meetingPoint: "invalid" },
    { meetingPoint: 1 },
    { meetingPoint: null },
    { meetingPoint: "station" },
    { meetingPoint: "offline", stationId: "a" },
    { meetingPoint: "arrange", stationId: "a" },
    { meetingPoint: "hub", stationId: "a" },
  ])("rejects conflicting meeting settings %j", async (settings) => {
    signInAs(cast.user);
    expect((await post({ message: "Ride", galaxy: 0, ...settings })).status).toBe(400);
    expect(stored()).toEqual([]);
  });
  it.each(["GET", "POST", "DELETE"])("requires approved membership for %s", async (method) => {
    const call = () =>
      method === "GET" ? get() : method === "POST" ? post({ message: "hi", galaxy: 0 }) : remove("x");
    for (const member of [null, cast.pending, cast.blocked, cast.offline]) {
      signInAs(member);
      expect((await call()).status).toBe(401);
    }
  });

  it.each([0, 255])("creates a request for galaxy %i without a station", async (galaxy) => {
    signInAs(cast.user);
    expect((await post({ message: "  Please help  ", galaxy })).status).toBe(201);
    expect(stored()[0]).toMatchObject({
      subjectType: "taxi",
      galaxy,
      body: "Please help",
      senderMemberId: cast.user.publicId,
    });
    expect(stored()[0]).not.toHaveProperty("meetingStation");
    expect(stored()[0]).not.toHaveProperty("recipientMemberId");
    expect((await (await get("?count=1")).json()).count).toBe(1);
  });

  it("resolves any alliance station server-side independently of the destination galaxy", async () => {
    signInAs(cast.user);
    writeDataFile("stations-v2.json", [{ ownerId: cast.admin.publicId, portal, galaxy: 0, name: "Home" }]);
    expect(
      (
        await post({
          message: "To Eissentam",
          galaxy: 9,
          meetingPoint: "station",
          stationId: `${cast.admin.publicId}:${portal}:0`,
          meetingStation: { name: "forged" },
        })
      ).status,
    ).toBe(201);
    expect(stored()[0]).toMatchObject({ galaxy: 9, meetingStation: { portal, galaxy: 0, name: "Home" } });
    const entry = (await (await get()).json())[0];
    expect(entry.meetingStation).toEqual({ portal, galaxy: 0, name: "Home" });
  });

  it("supports unnamed stations", async () => {
    signInAs(cast.user);
    writeDataFile("stations-v2.json", [{ ownerId: cast.admin.publicId, portal, galaxy: 0 }]);
    expect((await post({ message: "Ride", galaxy: 1, stationId: `${cast.admin.publicId}:${portal}:0` })).status).toBe(
      201,
    );
    expect(stored()[0].meetingStation).toEqual({ portal, galaxy: 0 });
  });

  it.each([-1, 256, 1.5, "9", null])("rejects invalid destination %j", async (galaxy) => {
    signInAs(cast.user);
    expect((await post({ message: "Ride", galaxy })).status).toBe(400);
    expect(stored()).toEqual([]);
  });

  it.each([
    null,
    [],
    {},
    { galaxy: 0, message: "" },
    { galaxy: 0, message: "x".repeat(2001) },
    { galaxy: 0, message: "ride", stationId: 1 },
  ])("rejects invalid payload %j", async (payload) => {
    signInAs(cast.user);
    expect((await post(payload)).status).toBe(400);
  });

  it("rejects unknown or removed stations", async () => {
    signInAs(cast.user);
    const response = await post({ galaxy: 0, message: "ride", stationId: "removed" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "taxi.station_not_found" });
  });

  it("keeps taxi and help threads and private inboxes separate", async () => {
    writeDataFile("private-messages.json", [
      taxi(),
      taxi({ id: "help-1", subjectType: "help" }),
      taxi({ id: "taxi-2", createdAt: "2026-02-01T00:00:00.000Z", senderMemberId: "deleted" }),
    ]);
    signInAs(cast.simpleAdmin);
    const entries = await (await get()).json();
    expect(entries.map((entry: { id: string }) => entry.id)).toEqual(["taxi-2", "taxi-1"]);
    expect(entries[0].senderName).toBe("Former member");
    expect(entries[1].senderName).toBe(cast.user.nmsName);
    expect((await (await get("?count")).json()).count).toBe(2);
    expect((await post({ message: "reply", replyToId: "help-1" })).status).toBe(404);
    expect((await remove("help-1")).status).toBe(404);
    const help = await import("@/app/api/help-requests/route");
    expect(
      (await help.POST(jsonRequest("/api/help-requests", "POST", { message: "reply", replyToId: "taxi-1" }))).status,
    ).toBe(404);
    const messages = await import("@/app/api/messages/route");
    expect(await (await messages.GET(new Request("http://localhost:3000/api/messages"))).json()).toEqual([]);
  });

  it("allows replies, preserves ordering, author deletion and moderator deletion with cascading replies", async () => {
    writeDataFile("private-messages.json", [taxi()]);
    signInAs(cast.admin);
    expect((await post({ message: "I can help", replyToId: "taxi-1" })).status).toBe(201);
    const reply = stored().find((entry) => entry.replyToId)!;
    expect(reply).toMatchObject({ subjectType: "taxi", threadId: "taxi-1", senderMemberId: cast.admin.publicId });
    expect((await (await get()).json())[0].replies).toHaveLength(1);
    signInAs(cast.moderator);
    expect((await remove("taxi-1")).status).toBe(200);
    expect(stored()).toEqual([]);
    writeDataFile("private-messages.json", [taxi()]);
    signInAs(cast.user);
    expect((await remove("taxi-1")).status).toBe(200);
  });

  it("denies deleting other members' requests in normal and simple views", async () => {
    writeDataFile("private-messages.json", [taxi({ senderMemberId: cast.admin.publicId })]);
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      expect((await remove("taxi-1")).status).toBe(403);
    }
    expect((await remove("unknown")).status).toBe(404);
    expect((await remove("")).status).toBe(400);
  });

  it.each(["", "x".repeat(2001)])("validates reply text", async (message) => {
    signInAs(cast.user);
    expect((await post({ message, replyToId: "taxi-1" })).status).toBe(400);
  });

  it("reports read, write, reply and deletion storage failures explicitly", async () => {
    signInAs(cast.user);
    writeDataFile("private-messages.json", {});
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await get()).status).toBe(503);
    expect((await post({ message: "Ride", galaxy: 0 })).status).toBe(503);
    expect((await post({ message: "Reply", replyToId: "x" })).status).toBe(503);
    expect((await remove("x")).status).toBe(503);
    expect(log).toHaveBeenCalledTimes(4);
  });
});
