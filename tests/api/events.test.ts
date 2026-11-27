import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventView } from "@/lib/events/event-views";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { defaultAlliance, makeMember, seedMembers } from "../helpers/members";
import { castMembers, makeCast, resetData, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;
// A second regular member, neither the creator nor staff.
let other: ReturnType<typeof makeMember>;
const hour = 60 * 60 * 1000;
const fromNow = (offset: number) => new Date(Date.now() + offset).toISOString();

const eventInput = () => ({
  type: "market",
  title: "Winter market",
  description: "Bring eggs",
  startsAt: fromNow(24 * hour),
  locationKind: "portal",
  portal: "0123456789AB",
  galaxy: 0,
});

beforeEach(() => {
  resetData();
  cast = makeCast();
  other = makeMember();
  seedMembers([...castMembers(cast), other]);
  vi.restoreAllMocks();
});

function multipart(method: string, payload: unknown, image?: File) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (image) form.set("image", image);
  return new Request("http://localhost:3000/api/events", { method, body: form });
}

const pngFile = () => new File([new Uint8Array(16)], "event.png", { type: "image/png" });
const uploads = () => path.join(process.cwd(), "data", "uploads", "alliance-manager", "events");
const uploadCount = () => (existsSync(uploads()) ? readdirSync(uploads()).length : 0);

async function eventsRoute() {
  return import("@/app/api/events/route");
}

async function list(): Promise<EventView[]> {
  return ((await (await (await eventsRoute()).GET()).json()) as { events: EventView[] }).events;
}

async function create(override: Record<string, unknown> = {}, image?: File) {
  return (await eventsRoute()).POST(multipart("POST", { ...eventInput(), ...override }, image));
}

async function createdId(override: Record<string, unknown> = {}, image?: File) {
  return ((await (await create(override, image)).json()) as { id: string }).id;
}

async function participate(body: unknown) {
  const route = await import("@/app/api/events/participation/route");
  return route.PUT(jsonRequest("/api/events/participation", "PUT", body));
}

async function messages(method: "POST" | "DELETE", body: unknown) {
  const route = await import("@/app/api/events/messages/route");
  return route[method](jsonRequest("/api/events/messages", method, body));
}

describe("access", () => {
  it.each(["pending", "blocked"] as const)("rejects %s members", async (key) => {
    signInAs(cast[key]);
    expect((await (await eventsRoute()).GET()).status).toBe(401);
    expect((await create()).status).toBe(401);
    expect((await participate({ eventId: "x", status: "going" })).status).toBe(401);
    expect((await messages("POST", { eventId: "x", message: "hi" })).status).toBe(401);
  });
});

describe("events", () => {
  it("lets any approved member create one, visible to everyone", async () => {
    signInAs(cast.user);
    expect((await create()).status).toBe(201);
    signInAs(other);
    const [event] = await list();
    expect(event).toMatchObject({ title: "Winter market", creatorId: cast.user.publicId, canManage: false });
    expect(event.location).toEqual({ kind: "portal", portal: "0123456789AB", galaxy: 0 });
  });

  it("allows only the creator and staff to edit or delete", async () => {
    signInAs(cast.user);
    const id = await createdId();
    const route = await eventsRoute();
    signInAs(other);
    const edit = { ...eventInput(), id, title: "Changed", locationKind: "keep" };
    expect((await route.PATCH(multipart("PATCH", edit))).status).toBe(403);
    expect((await route.DELETE(jsonRequest("/api/events", "DELETE", { id }))).status).toBe(403);
    signInAs(cast.moderator);
    expect((await route.PATCH(multipart("PATCH", edit))).status).toBe(200);
    expect((await list())[0]).toMatchObject({ title: "Changed", creatorId: cast.user.publicId });
    expect((await route.DELETE(jsonRequest("/api/events", "DELETE", { id }))).status).toBe(200);
    expect(await list()).toEqual([]);
  });

  it("saves the hub coordinates, so later changes do not move the event", async () => {
    signInAs(cast.user);
    expect((await create({ locationKind: "hub" })).status).toBe(400);
    seedMembers([...castMembers(cast), other], { ...defaultAlliance, portalCode: "10AB12CD34EF", galaxy: 3 });
    await create({ locationKind: "hub" });
    seedMembers([...castMembers(cast), other], { ...defaultAlliance, portalCode: "20AB12CD34EF", galaxy: 4 });
    expect((await list())[0].location).toEqual({ kind: "hub", portal: "10AB12CD34EF", galaxy: 3 });
  });

  it("rejects unknown stations, invalid addresses and invalid images", async () => {
    signInAs(cast.user);
    expect((await create({ locationKind: "station", stationId: "nobody:0123456789AB:0" })).status).toBe(400);
    expect((await create({ portal: "12" })).status).toBe(400);
    expect((await create({}, new File(["x"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect(await list()).toEqual([]);
  });

  it("deletes the stored image when it is removed and with its event", async () => {
    signInAs(cast.user);
    const id = await createdId({}, pngFile());
    expect(uploadCount()).toBe(1);
    expect((await list())[0].imageUrl).toContain("/api/events/image?path=");
    const route = await eventsRoute();
    await route.PATCH(multipart("PATCH", { ...eventInput(), id, locationKind: "keep", removeImage: true }));
    expect(uploadCount()).toBe(0);
    const second = await createdId({}, pngFile());
    await route.DELETE(jsonRequest("/api/events", "DELETE", { id: second }));
    expect(uploadCount()).toBe(0);
  });

  it("serves stored images only to approved members", async () => {
    signInAs(cast.user);
    await create({}, pngFile());
    const url = (await list())[0].imageUrl as string;
    const { GET } = await import("@/app/api/events/image/route");
    expect((await GET(new Request(`http://localhost:3000${url}`))).status).toBe(200);
    expect((await GET(new Request("http://localhost:3000/api/events/image?path=../access.json"))).status).toBe(404);
    signInAs(cast.pending);
    expect((await GET(new Request(`http://localhost:3000${url}`))).status).toBe(401);
  });
});

describe("participation", () => {
  it("records, changes and withdraws the member's own answer", async () => {
    signInAs(cast.user);
    const eventId = await createdId();
    await participate({ eventId, status: "maybe" });
    await participate({ eventId, status: "going" });
    expect((await list())[0]).toMatchObject({
      myStatus: "going",
      participants: [{ memberId: cast.user.publicId, status: "going" }],
    });
    await participate({ eventId, status: null });
    expect((await list())[0].participants).toEqual([]);
    expect((await participate({ eventId, status: "yes" })).status).toBe(400);
  });

  it("lets only staff remove somebody else's answer, and nobody answer for others", async () => {
    signInAs(cast.user);
    const eventId = await createdId();
    await participate({ eventId, status: "going" });
    const memberId = cast.user.publicId;
    signInAs(other);
    expect((await participate({ eventId, status: null, memberId })).status).toBe(403);
    signInAs(cast.moderator);
    expect((await participate({ eventId, status: "maybe", memberId })).status).toBe(403);
    expect((await participate({ eventId, status: null, memberId })).status).toBe(200);
    expect((await list())[0].participants).toEqual([]);
  });

  it("is read-only once the event is past", async () => {
    signInAs(cast.user);
    const eventId = await createdId({ startsAt: fromNow(-4 * hour) });
    expect((await participate({ eventId, status: "going" })).status).toBe(409);
    expect((await messages("POST", { eventId, message: "Thanks!" })).status).toBe(201);
  });
});

describe("messages", () => {
  it("are readable by everyone and deletable by their author or staff", async () => {
    signInAs(cast.user);
    const eventId = await createdId();
    expect((await messages("POST", { eventId, message: " " })).status).toBe(400);
    expect((await messages("POST", { eventId, message: "x".repeat(2001) })).status).toBe(400);
    await messages("POST", { eventId, message: "I bring eggs" });
    signInAs(other);
    const [message] = (await list())[0].messages;
    expect(message).toMatchObject({ body: "I bring eggs", canDelete: false });
    expect((await messages("DELETE", { eventId, messageId: message.id })).status).toBe(403);
    signInAs(cast.moderator);
    expect((await messages("DELETE", { eventId, messageId: message.id })).status).toBe(200);
    expect((await list())[0].messages).toEqual([]);
  });
});

describe("replies", () => {
  it("keeps one level, and removes the replies with their message", async () => {
    signInAs(cast.user);
    const eventId = await createdId();
    await messages("POST", { eventId, message: "Who brings eggs?" });
    const [root] = (await list())[0].messages;
    signInAs(other);
    await messages("POST", { eventId, message: "Me", replyToId: root.id });
    const reply = (await list())[0].messages[1];
    await messages("POST", { eventId, message: "Me too", replyToId: reply.id });
    expect((await list())[0].messages.map((message) => message.replyToId)).toEqual([undefined, root.id, root.id]);
    expect((await messages("POST", { eventId, message: "?", replyToId: "missing" })).status).toBe(404);
    signInAs(cast.user);
    await messages("DELETE", { eventId, messageId: root.id });
    expect((await list())[0].messages).toEqual([]);
  });
});

describe("sidebar", () => {
  async function ongoing() {
    const { GET } = await import("@/app/api/sidebar-counts/route");
    return ((await (await GET()).json()) as { eventOngoing: boolean }).eventOngoing;
  }

  it("flags only events that have started and are not past", async () => {
    signInAs(cast.user);
    await create();
    await create({ startsAt: fromNow(-4 * hour) });
    expect(await ongoing()).toBe(false);
    await create({ startsAt: fromNow(-hour) });
    expect(await ongoing()).toBe(true);
  });
});
