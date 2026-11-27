import { beforeEach, describe, expect, it, vi } from "vitest";
import * as eventsStore from "@/lib/events/events-store";
import * as imageStorage from "@/lib/storage/image-storage";
import * as stationsStore from "@/lib/stations/stations-store";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, resetData, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;
const future = "2099-01-01T20:00:00.000Z";
const input = {
  type: "market",
  title: "Market",
  description: "Eggs",
  startsAt: future,
  locationKind: "portal",
  portal: "0123456789AB",
  galaxy: 0,
};
const imagePath = "alliance-manager/events/00000000-0000-4000-8000-000000000000.png";

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function seedEvent(overrides: Record<string, unknown> = {}) {
  writeDataFile("events.json", [
    {
      id: "e1",
      type: "market",
      title: "Market",
      description: "Eggs",
      startsAt: future,
      location: { kind: "portal", portal: "0123456789AB", galaxy: 0 },
      creatorId: cast.user.publicId,
      createdAt: "2026-11-01T00:00:00.000Z",
      ...overrides,
    },
  ]);
}

const png = () => new File([new Uint8Array(8)], "a.png", { type: "image/png" });

function multipart(method: string, payload: string, image?: File) {
  const form = new FormData();
  form.set("payload", payload);
  if (image) form.set("image", image);
  return new Request("http://localhost:3000/api/events", { method, body: form });
}

const route = () => import("@/app/api/events/route");
const edit = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...input, id: "e1", ...overrides });

describe("/api/events errors", () => {
  beforeEach(() => signInAs(cast.user));

  it("requires an approved member to change or delete", async () => {
    signInAs(cast.pending);
    const api = await route();
    expect((await api.PATCH(multipart("PATCH", edit()))).status).toBe(401);
    expect((await api.DELETE(jsonRequest("/api/events", "DELETE", { id: "e1" }))).status).toBe(401);
  });

  it("returns one event, or 404 for an unknown one", async () => {
    seedEvent();
    const { GET } = await route();
    expect((await GET(new Request("http://localhost:3000/api/events?detailEvent=e1"))).status).toBe(200);
    expect((await GET(new Request("http://localhost:3000/api/events?detailEvent=x"))).status).toBe(404);
  });

  it("rejects malformed payloads, locations and identifiers", async () => {
    seedEvent();
    const api = await route();
    expect((await api.POST(multipart("POST", "{broken"))).status).toBe(400);
    expect((await api.POST(multipart("POST", "[]"))).status).toBe(400);
    expect((await api.POST(jsonRequest("/api/events", "POST", { ...input, locationKind: "keep" }))).status).toBe(400);
    expect((await api.PATCH(multipart("PATCH", JSON.stringify(input)))).status).toBe(404);
    expect((await api.PATCH(multipart("PATCH", edit({ id: "missing" })))).status).toBe(404);
    expect((await api.PATCH(multipart("PATCH", edit({ title: "" })))).status).toBe(400);
    expect((await api.PATCH(multipart("PATCH", edit(), new File(["x"], "a.gif", { type: "image/gif" })))).status).toBe(
      400,
    );
    expect((await api.PATCH(multipart("PATCH", edit({ locationKind: "nowhere" })))).status).toBe(400);
    expect((await api.DELETE(jsonRequest("/api/events", "DELETE", {}))).status).toBe(404);
  });

  it("saves a station snapshot, with or without a name", async () => {
    vi.spyOn(stationsStore, "readAllStationPortals").mockResolvedValue([
      { portal: "1234567890AB", galaxy: 2, ownerId: cast.user.publicId, name: "Base", createdAt: future },
      { portal: "1234567890AC", galaxy: 2, ownerId: cast.user.publicId },
      { portal: "XX", galaxy: 2, ownerId: cast.user.publicId },
    ]);
    const api = await route();
    const create = (portal: string) =>
      api.POST(
        multipart(
          "POST",
          JSON.stringify({ ...input, locationKind: "station", stationId: `${cast.user.publicId}:${portal}:2` }),
        ),
      );
    expect((await create("1234567890AB")).status).toBe(201);
    expect((await create("1234567890AC")).status).toBe(201);
    expect((await create("XX")).status).toBe(400);
    expect((await eventsStore.readEvents()).map((event) => event.location.name)).toEqual(["Base", undefined]);
  });

  it("replaces the stored image and keeps going when the old one cannot be deleted", async () => {
    seedEvent({ imagePath });
    vi.spyOn(imageStorage, "deleteImage").mockRejectedValue(new Error("down"));
    const api = await route();
    expect((await api.PATCH(multipart("PATCH", edit(), png()))).status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it("removes the new image when the event disappears while saving", async () => {
    seedEvent();
    vi.spyOn(eventsStore, "updateEvent").mockResolvedValue(null);
    const remove = vi.spyOn(imageStorage, "deleteImage");
    const api = await route();
    expect((await api.PATCH(multipart("PATCH", edit(), png()))).status).toBe(404);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the storage fails", async () => {
    seedEvent();
    const failure = new Error("down");
    vi.spyOn(eventsStore, "addEvent").mockRejectedValue(failure);
    vi.spyOn(eventsStore, "updateEvent").mockRejectedValue(failure);
    vi.spyOn(eventsStore, "removeEvent").mockRejectedValue(failure);
    const api = await route();
    expect((await api.POST(multipart("POST", JSON.stringify(input), png()))).status).toBe(503);
    expect((await api.PATCH(multipart("PATCH", edit(), png()))).status).toBe(503);
    expect((await api.DELETE(jsonRequest("/api/events", "DELETE", { id: "e1" }))).status).toBe(503);
    vi.spyOn(eventsStore, "readEvents").mockRejectedValue(failure);
    expect((await api.GET()).status).toBe(503);
  });
});

describe("participation, message and image errors", () => {
  beforeEach(() => signInAs(cast.user));

  const put = async (body: unknown) =>
    (await import("@/app/api/events/participation/route")).PUT(jsonRequest("/api/events/participation", "PUT", body));
  const messages = async (method: "POST" | "DELETE", body: unknown) =>
    (await import("@/app/api/events/messages/route"))[method](jsonRequest("/api/events/messages", method, body));
  const image = async (path: string) =>
    (await import("@/app/api/events/image/route")).GET(
      new Request(`http://localhost:3000/api/events/image?path=${encodeURIComponent(path)}`),
    );

  it("answers 404 for unknown events and messages", async () => {
    expect((await put({ eventId: "x", status: "going" })).status).toBe(404);
    expect((await put({ status: "going" })).status).toBe(404);
    expect((await put("{broken")).status).toBe(400);
    expect((await messages("POST", { eventId: "x", message: "hi" })).status).toBe(404);
    expect((await messages("DELETE", { eventId: "x", messageId: "y" })).status).toBe(404);
    expect((await messages("POST", "{broken")).status).toBe(400);
    signInAs(cast.pending);
    expect((await messages("DELETE", {})).status).toBe(401);
  });

  it("answers 404 when the event disappears while saving", async () => {
    seedEvent();
    vi.spyOn(eventsStore, "setParticipation").mockResolvedValue(null);
    vi.spyOn(eventsStore, "addEventMessage").mockResolvedValue(null);
    expect((await put({ eventId: "e1", status: "going" })).status).toBe(404);
    expect((await messages("POST", { eventId: "e1", message: "hi" })).status).toBe(404);
  });

  it("answers 503 when the storage fails", async () => {
    seedEvent({ messages: [{ id: "m1", senderMemberId: cast.user.publicId, body: "hi", createdAt: future }] });
    const failure = new Error("down");
    vi.spyOn(eventsStore, "setParticipation").mockRejectedValue(failure);
    vi.spyOn(eventsStore, "addEventMessage").mockRejectedValue(failure);
    vi.spyOn(eventsStore, "removeEventMessage").mockRejectedValue(failure);
    expect((await put({ eventId: "e1", status: "going" })).status).toBe(503);
    expect((await messages("POST", { eventId: "e1", message: "hi" })).status).toBe(503);
    expect((await messages("DELETE", { eventId: "e1", messageId: "m1" })).status).toBe(503);
  });

  it("handles missing and unreadable images", async () => {
    expect((await image(imagePath)).status).toBe(404);
    vi.spyOn(imageStorage, "readImage").mockRejectedValue(new Error("down"));
    expect((await image(imagePath)).status).toBe(503);
    const { GET } = await import("@/app/api/events/image/route");
    expect((await GET(new Request("http://localhost:3000/api/events/image"))).status).toBe(404);
  });

  it("reads former members as unnamed and leaves them out of the participants", async () => {
    seedEvent({
      creatorId: "gone",
      participants: [{ memberId: "gone", status: "going" }],
      messages: [{ id: "m1", senderMemberId: "gone", body: "hi", createdAt: future }],
    });
    const { events } = (await (await (await route()).GET()).json()) as {
      events: { creatorName: string; creatorMemberId?: string; participants: unknown[] }[];
    };
    expect(events[0]).toMatchObject({ creatorName: "", participants: [] });
    expect(events[0].creatorMemberId).toBeUndefined();
  });

  it("changes nothing for an event that no longer exists", async () => {
    expect(await eventsStore.setParticipation("x", "m", "going")).toBeNull();
    expect(await eventsStore.readEvents()).toEqual([]);
  });
});

describe("stored events", () => {
  it("skips invalid and duplicated entries", async () => {
    seedEvent();
    expect(await eventsStore.readEvents()).toHaveLength(1);
    const valid = {
      id: "e1",
      type: "other",
      title: "A",
      startsAt: future,
      endsAt: "2000-01-01T00:00:00.000Z",
      location: { kind: "station", portal: "0123456789AB", galaxy: 0, name: "Base" },
      creatorId: "m",
      updatedAt: future,
    };
    writeDataFile("events.json", [valid, valid, { id: "broken" }]);
    const events = await eventsStore.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].endsAt).toBeUndefined();
    expect(events[0]).toMatchObject({ updatedAt: future, location: { name: "Base" } });
  });
});

describe("malformed requests and end times", () => {
  beforeEach(() => signInAs(cast.user));

  it("rejects unreadable bodies", async () => {
    const api = await route();
    expect((await api.DELETE(jsonRequest("/api/events", "DELETE", "{broken"))).status).toBe(404);
    const garbage = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: "garbage",
    });
    expect((await api.POST(garbage)).status).toBe(400);
    const noPayload = new Request("http://localhost:3000/api/events", { method: "POST", body: new FormData() });
    expect((await api.POST(noPayload)).status).toBe(400);
    expect((await api.POST(multipart("POST", JSON.stringify({ ...input, galaxy: 999 })))).status).toBe(400);
  });

  it("stores the end time, orders going before maybe and updates one event only", async () => {
    const api = await route();
    const endsAt = "2099-01-01T22:00:00.000Z";
    await api.POST(multipart("POST", JSON.stringify({ ...input, endsAt })));
    await api.POST(multipart("POST", JSON.stringify({ ...input, title: "Second" })));
    const [first] = await eventsStore.readEvents();
    await eventsStore.setParticipation(first.id, cast.user.publicId, "maybe");
    await eventsStore.setParticipation(first.id, cast.moderator.publicId, "going");
    const { events } = (await (await api.GET()).json()) as {
      events: { title: string; endsAt?: string; participants: { status: string }[] }[];
    };
    expect(events[0].endsAt).toBe(endsAt);
    expect(events[0].participants.map((participant) => participant.status)).toEqual(["going", "maybe"]);
    expect(events[1]).toMatchObject({ title: "Second", participants: [] });
  });
});
