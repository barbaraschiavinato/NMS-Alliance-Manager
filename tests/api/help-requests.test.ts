import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, readDataFile, resetData, writeRawDataFile, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const url = "/api/help-requests";
const portal = "0123456789AB";
let cast: Cast;

type StoredMessage = Record<string, unknown> & { id: string };

function helpEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `help-${Math.random().toString(36).slice(2, 8)}`,
    senderMemberId: cast.user.publicId,
    body: "Need a hand",
    subjectType: "help",
    subject: "Stuck",
    portal,
    galaxy: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function storedMessages() {
  return readDataFile<StoredMessage[]>("private-messages.json");
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("private-messages.json", []);
});

async function routes() {
  return import("@/app/api/help-requests/route");
}

async function getRequests(query = "") {
  return (await routes()).GET(new Request(`http://localhost:3000${url}${query}`));
}

async function post(body: unknown) {
  return (await routes()).POST(jsonRequest(url, "POST", body));
}

async function remove(body: unknown) {
  return (await routes()).DELETE(jsonRequest(url, "DELETE", body));
}

describe("authorization shared by every method", () => {
  const calls = {
    GET: async () => getRequests(),
    POST: async () => post({ message: "hi", subject: "s", portal, galaxy: 0 }),
    DELETE: async () => remove({ id: "x" }),
  };
  for (const [method, call] of Object.entries(calls)) {
    it(`${method} returns 401 without a session or for pending, blocked and offline members`, async () => {
      signInAs(null);
      expect((await call()).status).toBe(401);
      for (const member of [cast.pending, cast.blocked, cast.offline]) {
        signInAs(member);
        expect((await call()).status).toBe(401);
      }
    });
  }
});

describe("GET /api/help-requests", () => {
  beforeEach(() => {
    writeDataFile("private-messages.json", [
      helpEntry({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
      helpEntry({
        id: "new",
        senderMemberId: cast.moderator.publicId,
        createdAt: "2026-02-01T00:00:00.000Z",
        missionCode: "M-1",
      }),
      helpEntry({
        id: "r2",
        replyToId: "old",
        threadId: "old",
        senderMemberId: "removed",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      helpEntry({
        id: "r1",
        replyToId: "old",
        threadId: "old",
        senderMemberId: cast.admin.publicId,
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      {
        id: "pm",
        senderMemberId: cast.user.publicId,
        recipientMemberId: cast.admin.publicId,
        body: "private",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
  });

  it("counts open requests", async () => {
    signInAs(cast.user);
    const response = await getRequests("?count");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 2 });
  });

  it("lists requests newest first with their replies oldest first, without private messages", async () => {
    signInAs(cast.simpleAdmin);
    const response = await getRequests();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      id: string;
      senderName: string;
      replies: { id: string; senderName: string }[];
    }[];
    expect(body.map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(body[0]).toEqual({
      id: "new",
      senderMemberId: cast.moderator.publicId,
      subject: "Stuck",
      body: "Need a hand",
      portal,
      galaxy: 0,
      missionCode: "M-1",
      createdAt: "2026-02-01T00:00:00.000Z",
      senderName: cast.moderator.nmsName,
      replies: [],
    });
    expect(body[1].replies.map((reply) => [reply.id, reply.senderName])).toEqual([
      ["r1", cast.admin.nmsName],
      ["r2", "Former member"],
    ]);
  });

  it("shows requests from an unknown legacy email as from a former member", async () => {
    writeDataFile("private-messages.json", [
      { ...helpEntry({ id: "legacy", senderMemberId: undefined }), senderEmail: "gone@example.com" },
    ]);
    signInAs(cast.user);
    const [entry] = (await (await getRequests()).json()) as Record<string, unknown>[];
    expect(entry).toMatchObject({ id: "legacy", senderName: "Former member", replies: [] });
    expect(entry).not.toHaveProperty("senderMemberId");
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("private-messages.json", "{broken");
    signInAs(cast.user);
    expect((await getRequests()).status).toBe(503);
    expect((await getRequests("?count=1")).status).toBe(503);
  });
});

describe("POST /api/help-requests", () => {
  it("rejects malformed bodies", async () => {
    signInAs(cast.user);
    for (const body of ["{", [], null]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  describe("new request", () => {
    it.each([
      ["a blank message", { message: " " }, "profile.message_text_required"],
      ["a long message", { message: "x".repeat(2001) }, "profile.message_text_too_long"],
      ["a non-string message", { message: 1 }, "profile.message_text_required"],
      ["a blank subject", { subject: "  " }, "help.request_invalid"],
      ["a non-string subject", { subject: 3 }, "help.request_invalid"],
      ["a long subject", { subject: "s".repeat(161) }, "help.request_invalid"],
      ["a missing galaxy", { galaxy: undefined }, "help.request_invalid"],
      ["a fractional galaxy", { galaxy: 1.5 }, "help.request_invalid"],
      ["a negative galaxy", { galaxy: -1 }, "help.request_invalid"],
      ["a galaxy over 255", { galaxy: 256 }, "help.request_invalid"],
      ["a malformed portal", { portal: "XYZ" }, "help.request_invalid"],
      ["an invalid portal", { portal: "0FFF56789ABC" }, "help.request_invalid"],
      ["a missing portal", { portal: 12 }, "help.request_invalid"],
    ])("rejects %s", async (_label, overrides, error) => {
      signInAs(cast.user);
      const response = await post({ message: "Help", subject: "Stuck", portal, galaxy: 0, ...overrides });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
      expect(storedMessages()).toEqual([]);
    });

    it("saves a request from any approved member", async () => {
      signInAs(cast.user);
      const response = await post({
        message: "  Need fuel  ",
        subject: " Stranded ",
        portal: portal.toLowerCase(),
        galaxy: 4,
      });
      expect(response.status).toBe(201);
      const [saved] = storedMessages();
      expect(saved).toMatchObject({
        threadId: saved.id,
        senderMemberId: cast.user.publicId,
        body: "Need fuel",
        subjectType: "help",
        subject: "Stranded",
        portal,
        galaxy: 4,
      });
      expect(saved).not.toHaveProperty("recipientMemberId");
    });

    it("returns 503 when storage fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      writeRawDataFile("private-messages.json", "{broken");
      signInAs(cast.user);
      expect((await post({ message: "Help", subject: "Stuck", portal, galaxy: 0 })).status).toBe(503);
    });
  });

  describe("reply", () => {
    beforeEach(() => {
      writeDataFile("private-messages.json", [
        helpEntry({ id: "req" }),
        helpEntry({ id: "rep", replyToId: "req", threadId: "req" }),
        {
          id: "pm",
          senderMemberId: cast.user.publicId,
          recipientMemberId: cast.admin.publicId,
          body: "private",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ]);
    });

    it("validates the reply text", async () => {
      signInAs(cast.moderator);
      expect(await (await post({ replyToId: "req", message: "" })).json()).toEqual({
        error: "profile.message_text_required",
      });
      const tooLong = await post({ replyToId: "req", message: "x".repeat(2001) });
      expect(tooLong.status).toBe(400);
      expect(await tooLong.json()).toEqual({ error: "profile.message_text_too_long" });
    });

    it("returns 404 unless replying to an open help request", async () => {
      signInAs(cast.moderator);
      for (const replyToId of ["missing", "rep", "pm"]) {
        expect((await post({ replyToId, message: "ok" })).status).toBe(404);
      }
      expect(storedMessages()).toHaveLength(3);
    });

    it("saves the reply in the request thread", async () => {
      signInAs(cast.moderator);
      expect((await post({ replyToId: " req ", message: " On my way " })).status).toBe(201);
      expect(storedMessages()[3]).toMatchObject({
        threadId: "req",
        replyToId: "req",
        senderMemberId: cast.moderator.publicId,
        body: "On my way",
        subjectType: "help",
      });
    });

    it("returns 503 when storage fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      writeRawDataFile("private-messages.json", "{broken");
      signInAs(cast.user);
      expect((await post({ replyToId: "req", message: "ok" })).status).toBe(503);
    });
  });
});

describe("DELETE /api/help-requests", () => {
  beforeEach(() => {
    writeDataFile("private-messages.json", [
      helpEntry({ id: "req", senderMemberId: cast.user.publicId }),
      helpEntry({ id: "rep", replyToId: "req", threadId: "req", senderMemberId: cast.moderator.publicId }),
      helpEntry({ id: "other", senderMemberId: cast.admin.publicId }),
      {
        id: "pm",
        senderMemberId: cast.user.publicId,
        recipientMemberId: cast.admin.publicId,
        body: "private",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
  });

  it("rejects a missing id", async () => {
    signInAs(cast.user);
    for (const body of ["{", {}, { id: 4 }, { id: "" }]) {
      expect((await remove(body)).status).toBe(400);
    }
  });

  it("returns 404 for unknown ids and private messages", async () => {
    signInAs(cast.admin);
    expect((await remove({ id: "missing" })).status).toBe(404);
    expect((await remove({ id: "pm" })).status).toBe(404);
    expect(storedMessages()).toHaveLength(4);
  });

  it("forbids users and simple-view admins from deleting someone else's request", async () => {
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      const response = await remove({ id: "other" });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "messages.delete_not_allowed" });
    }
    expect(storedMessages()).toHaveLength(4);
  });

  it("lets the author delete their request together with its replies", async () => {
    signInAs(cast.user);
    expect((await remove({ id: "req" })).status).toBe(200);
    expect(storedMessages().map((entry) => entry.id)).toEqual(["other", "pm"]);
  });

  it("lets moderators delete any request", async () => {
    signInAs(cast.moderator);
    expect((await remove({ id: "other" })).status).toBe(200);
    expect(storedMessages().map((entry) => entry.id)).toEqual(["req", "rep", "pm"]);
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("private-messages.json", "{broken");
    signInAs(cast.moderator);
    expect((await remove({ id: "req" })).status).toBe(503);
  });
});
