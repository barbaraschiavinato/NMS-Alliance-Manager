import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  castMembers,
  makeCast,
  readDataFile,
  resetData,
  storedMission,
  writeRawDataFile,
  type Cast,
} from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const portal = "1123456789AB";
const url = "/api/messages";
let cast: Cast;

type StoredMessage = Record<string, unknown> & { id: string };

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: `pm-${Math.random().toString(36).slice(2, 8)}`,
    senderMemberId: cast.user.publicId,
    recipientMemberId: cast.moderator.publicId,
    body: "Hello",
    subjectType: "planet",
    subject: "Eden",
    portal,
    galaxy: 0,
    planetNumber: 1,
    unread: true,
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
  writeDataFile("missions.json", []);
  writeDataFile("private-messages.json", []);
});

async function routes() {
  return import("@/app/api/messages/route");
}

async function getMessages(query = "") {
  return (await routes()).GET(new Request(`http://localhost:3000${url}${query}`));
}

describe("authorization shared by every method", () => {
  const calls = {
    GET: async () => getMessages(),
    POST: async () =>
      (await routes()).POST(jsonRequest(url, "POST", { message: "hi", recipientId: cast.moderator.publicId })),
    DELETE: async () => (await routes()).DELETE(jsonRequest(url, "DELETE", { messageId: "pm-1" })),
    PATCH: async () => (await routes()).PATCH(jsonRequest(url, "PATCH", { messageIds: ["pm-1"] })),
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

describe("GET /api/messages", () => {
  it("resolves station detail links from the current owner, matching system and galaxy", async () => {
    writeDataFile("stations-v2.json", [
      { portal, galaxy: 1, ownerId: cast.admin.publicId },
      { portal: "2123456789AB", galaxy: 0, ownerId: cast.moderator.publicId },
    ]);
    writeDataFile("private-messages.json", [
      message({ id: "linked" }),
      message({ id: "missing", galaxy: 2 }),
      message({ id: "no-address", portal: undefined }),
      message({ id: "no-galaxy", galaxy: undefined }),
    ]);
    signInAs(cast.user);
    const response = await getMessages();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.find((entry: StoredMessage) => entry.id === "linked").stationHref).toBe(
      `/stations/${cast.moderator.publicId}%3A2123456789AB%3A0?from=messages`,
    );
    for (const id of ["missing", "no-address", "no-galaxy"]) {
      expect(body.find((entry: StoredMessage) => entry.id === id)).not.toHaveProperty("stationHref");
    }
  });

  it("does not link another member's station for a viewer restricted to their own archive", async () => {
    const plain = makeMember({ specialty: "" });
    seedMembers([...castMembers(cast), plain]);
    writeDataFile("stations-v2.json", [{ portal, galaxy: 0, ownerId: cast.moderator.publicId }]);
    writeDataFile("private-messages.json", [message({ recipientMemberId: plain.publicId })]);
    signInAs(plain);
    expect((await (await getMessages()).json())[0]).not.toHaveProperty("stationHref");
    writeDataFile("stations-v2.json", [{ portal, galaxy: 0, ownerId: plain.publicId }]);
    expect((await (await getMessages()).json())[0].stationHref).toBe(
      `/stations/${plain.publicId}%3A${portal}%3A0?from=messages`,
    );
  });

  it("reports station lookup failures explicitly", async () => {
    writeDataFile("private-messages.json", [message()]);
    writeRawDataFile("stations-v2.json", "{");
    signInAs(cast.user);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getMessages()).status).toBe(503);
  });
  it("lists the member's own conversations, newest first, without help requests", async () => {
    const emailNamed = makeMember({ name: "mail@example.com", nmsName: "" });
    seedMembers([...castMembers(cast), emailNamed]);
    writeDataFile("private-messages.json", [
      message({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
      message({
        id: "new",
        senderMemberId: cast.moderator.publicId,
        recipientMemberId: cast.user.publicId,
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      message({
        id: "email-name",
        senderMemberId: emailNamed.publicId,
        recipientMemberId: cast.user.publicId,
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
      message({
        id: "gone",
        senderMemberId: "removed-member",
        recipientMemberId: cast.user.publicId,
        createdAt: "2026-01-10T00:00:00.000Z",
      }),
      message({ id: "others", senderMemberId: cast.admin.publicId, recipientMemberId: cast.moderator.publicId }),
      {
        id: "help",
        senderMemberId: cast.user.publicId,
        body: "help me",
        subjectType: "help",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
    signInAs(cast.user);
    const response = await getMessages();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { id: string; senderName: string; recipientName: string }[];
    expect(body.map((entry) => entry.id)).toEqual(["new", "email-name", "gone", "old"]);
    expect(body[0]).toMatchObject({ senderName: cast.moderator.nmsName, recipientName: cast.user.nmsName });
    expect(body[1].senderName).toBe("Former member");
    expect(body[2].senderName).toBe("Former member");
  });

  it("lets only real admins read every conversation", async () => {
    writeDataFile("private-messages.json", [
      message({ id: "a", senderMemberId: cast.user.publicId, recipientMemberId: cast.moderator.publicId }),
      {
        id: "help",
        senderMemberId: cast.user.publicId,
        body: "help",
        subjectType: "help",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
    for (const member of [cast.user, cast.moderator, cast.simpleAdmin]) {
      signInAs(member);
      expect((await getMessages("?scope=all")).status).toBe(403);
    }
    signInAs(cast.admin);
    const response = await getMessages("?scope=all");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }[]).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("shows legacy messages from and to unknown emails as former members", async () => {
    writeDataFile("private-messages.json", [
      {
        ...message({ id: "legacy", senderMemberId: undefined, recipientMemberId: undefined }),
        senderEmail: "gone@example.com",
        recipientEmail: "left@example.com",
      },
    ]);
    signInAs(cast.admin);
    const response = await getMessages("?scope=all");
    expect(response.status).toBe(200);
    const [entry] = (await response.json()) as Record<string, unknown>[];
    expect(entry).toMatchObject({ id: "legacy", senderName: "Former member", recipientName: "Former member" });
    expect(entry).not.toHaveProperty("senderMemberId");
    expect(entry).not.toHaveProperty("recipientMemberId");
    expect(entry).not.toHaveProperty("senderEmail");
  });

  it("counts the member's unread received messages", async () => {
    writeDataFile("private-messages.json", [
      message({ recipientMemberId: cast.user.publicId, senderMemberId: cast.moderator.publicId }),
      message({ recipientMemberId: cast.user.publicId, senderMemberId: cast.moderator.publicId, unread: false }),
      message({ recipientMemberId: cast.moderator.publicId }),
    ]);
    signInAs(cast.user);
    const response = await getMessages("?count=unread");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 });
  });

  it("returns 503 when the messages cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("private-messages.json", "{broken");
    signInAs(cast.user);
    expect((await getMessages()).status).toBe(503);
    expect((await getMessages("?count=unread")).status).toBe(503);
  });

  describe("planet subject lookup (?recipientId=)", () => {
    beforeEach(() => {
      writeDataFile("stations-v2.json", [
        { portal, galaxy: 0, ownerId: cast.moderator.publicId, name: "Moderator Base" },
        { portal: "2123456789AB", galaxy: 3, ownerId: cast.moderator.publicId },
        { portal: "3123456789AB", galaxy: 0, ownerId: cast.moderator.publicId },
      ]);
      writeDataFile("almanac.json", { "2123456789AB": { 3: { lines: { headline: { word: " Verdant " } } } } });
    });

    it.each([
      ["a missing recipient", `?recipientId=&portal=${portal}&galaxy=0`],
      ["a missing portal and galaxy", "?recipientId=x"],
      ["a malformed portal", `?recipientId=x&portal=XYZ&galaxy=0`],
      ["an invalid planet index", `?recipientId=x&portal=7123456789AB&galaxy=0`],
      ["a non-numeric galaxy", `?recipientId=x&portal=${portal}&galaxy=-1`],
      ["a galaxy over 255", `?recipientId=x&portal=${portal}&galaxy=256`],
    ])("rejects %s", async (_label, query) => {
      signInAs(cast.user);
      expect((await getMessages(query)).status).toBe(400);
    });

    it("returns 404 for recipients that cannot receive messages", async () => {
      signInAs(cast.user);
      for (const recipient of [cast.pending, cast.offline, { publicId: "unknown" }]) {
        const response = await getMessages(`?recipientId=${recipient.publicId}&portal=${portal}&galaxy=0`);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "profile.message_recipient_not_found" });
      }
    });

    it("returns 404 when the recipient does not own that planet", async () => {
      signInAs(cast.user);
      expect((await getMessages(`?recipientId=${cast.moderator.publicId}&portal=${portal}&galaxy=1`)).status).toBe(404);
    });

    it("resolves the station name, then the almanac name, then a planet number", async () => {
      signInAs(cast.user);
      const subject = async (query: string) =>
        ((await (await getMessages(`?recipientId=${cast.moderator.publicId}&${query}`)).json()) as { subject: string })
          .subject;
      expect(await subject(`portal=${portal.toLowerCase()}&galaxy=0`)).toBe("Moderator Base");
      expect(await subject("portal=2123456789AB&galaxy=3")).toBe("Verdant");
      expect(await subject("portal=3123456789AB&galaxy=0")).toBe("Planet 3");
    });

    it("returns 503 when the stations cannot be read", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      writeRawDataFile("stations-v2.json", "{broken");
      signInAs(cast.user);
      expect((await getMessages(`?recipientId=${cast.moderator.publicId}&portal=${portal}&galaxy=0`)).status).toBe(503);
    });
  });
});

describe("POST /api/messages", () => {
  async function post(body: unknown) {
    return (await routes()).POST(jsonRequest(url, "POST", body));
  }

  beforeEach(() => {
    writeDataFile("stations-v2.json", [
      { portal, galaxy: 0, ownerId: cast.moderator.publicId, name: "Moderator Base" },
    ]);
  });

  it.each([
    ["a malformed body", "{", "profile.message_text_required"],
    ["an array body", [], "profile.message_text_required"],
    ["a blank message", { message: "   " }, "profile.message_text_required"],
    ["a non-string message", { message: 42 }, "profile.message_text_required"],
    ["a message over 2000 characters", { message: "x".repeat(2001) }, "profile.message_text_too_long"],
  ])("rejects %s", async (_label, body, error) => {
    signInAs(cast.user);
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });

  describe("new conversation", () => {
    it("requires a recipient that can receive messages", async () => {
      signInAs(cast.user);
      expect((await post({ message: "hi", context: { type: "planet", portal, galaxy: 0 } })).status).toBe(400);
      for (const recipient of [cast.pending, cast.blocked, cast.offline, { publicId: "unknown" }]) {
        expect(
          (
            await post({
              message: "hi",
              recipientId: recipient.publicId,
              context: { type: "planet", portal, galaxy: 0 },
            })
          ).status,
        ).toBe(404);
      }
      expect(storedMessages()).toEqual([]);
    });

    it("sends a message about a planet owned by the recipient", async () => {
      signInAs(cast.user);
      const response = await post({
        message: "  Nice base  ",
        recipientId: ` ${cast.moderator.publicId} `,
        context: { type: "planet", portal: portal.toLowerCase(), galaxy: 0 },
      });
      expect(response.status).toBe(201);
      const [saved] = storedMessages();
      expect(saved).toMatchObject({
        threadId: saved.id,
        senderMemberId: cast.user.publicId,
        recipientMemberId: cast.moderator.publicId,
        body: "Nice base",
        subjectType: "planet",
        subject: "Moderator Base",
        portal,
        galaxy: 0,
        planetNumber: 1,
        unread: true,
      });
      expect(saved).not.toHaveProperty("replyToId");
    });

    it("rejects planet contexts that are invalid or not owned by the recipient", async () => {
      signInAs(cast.user);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "planet", portal: "7123456789AB", galaxy: 0 },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "planet", portal, galaxy: 9 },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.admin.publicId,
            context: { type: "planet", portal, galaxy: 0 },
          })
        ).status,
      ).toBe(400);
      expect(storedMessages()).toEqual([]);
    });

    it("sends a message about a mission assigned to the recipient", async () => {
      writeDataFile("missions.json", [
        storedMission({ id: "M-1", title: "Build a farm", assignedMemberId: cast.moderator.publicId }),
        storedMission({ id: "M-2", assignedMemberId: cast.admin.publicId, systemAddress: "0124456789AB" }),
      ]);
      signInAs(cast.user);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "mission", missionCode: "M-2" },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "mission", missionCode: "M-404" },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "mission", missionCode: "M-1" },
          })
        ).status,
      ).toBe(201);
      expect(storedMessages()).toHaveLength(1);
      expect(storedMessages()[0]).toMatchObject({
        subjectType: "mission",
        subject: "Build a farm",
        missionCode: "M-1",
      });
    });

    it("requires a planet or mission context", async () => {
      signInAs(cast.user);
      for (const context of [
        undefined,
        [],
        { type: "mission", missionCode: " " },
        { type: "planet", portal, galaxy: 1.5 },
        { type: "other" },
      ]) {
        const response = await post({ message: "hi", recipientId: cast.moderator.publicId, context });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "profile.message_context_required" });
      }
    });

    it("returns 503 when the message cannot be saved", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      writeRawDataFile("private-messages.json", "{broken");
      signInAs(cast.user);
      expect(
        (
          await post({
            message: "hi",
            recipientId: cast.moderator.publicId,
            context: { type: "planet", portal, galaxy: 0 },
          })
        ).status,
      ).toBe(503);
    });
  });

  describe("reply", () => {
    it("returns 404 for an unknown original", async () => {
      signInAs(cast.user);
      expect((await post({ message: "re", replyToId: "missing" })).status).toBe(404);
    });

    it("only lets the two participants reply", async () => {
      writeDataFile("private-messages.json", [message({ id: "orig" })]);
      for (const member of [cast.admin, cast.simpleAdmin]) {
        signInAs(member);
        const response = await post({ message: "re", replyToId: "orig" });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "messages.reply_not_allowed" });
      }
    });

    it("returns 404 when the other participant can no longer receive messages", async () => {
      writeDataFile("private-messages.json", [
        message({ id: "orig", senderMemberId: cast.blocked.publicId, recipientMemberId: cast.user.publicId }),
      ]);
      signInAs(cast.user);
      expect((await post({ message: "re", replyToId: "orig" })).status).toBe(404);
    });

    it("replies to a planet message in the same thread", async () => {
      writeDataFile("private-messages.json", [message({ id: "orig", threadId: "thread-1" })]);
      signInAs(cast.moderator);
      expect((await post({ message: " thanks ", replyToId: " orig " })).status).toBe(201);
      const reply = storedMessages().find((entry) => entry.id !== "orig");
      expect(reply).toMatchObject({
        threadId: "thread-1",
        replyToId: "orig",
        senderMemberId: cast.moderator.publicId,
        recipientMemberId: cast.user.publicId,
        body: "thanks",
        subjectType: "planet",
        subject: "Eden",
        portal,
        galaxy: 0,
        planetNumber: 1,
        unread: true,
      });
    });

    it("replies to a mission message, starting the thread from the original", async () => {
      writeDataFile("private-messages.json", [
        message({
          id: "orig",
          subjectType: "mission",
          subject: "Farm",
          missionCode: "M-1",
          portal: undefined,
          galaxy: undefined,
          planetNumber: undefined,
        }),
      ]);
      signInAs(cast.user);
      expect((await post({ message: "more", replyToId: "orig" })).status).toBe(201);
      expect(storedMessages().find((entry) => entry.id !== "orig")).toMatchObject({
        threadId: "orig",
        replyToId: "orig",
        recipientMemberId: cast.moderator.publicId,
        subjectType: "mission",
        subject: "Farm",
        missionCode: "M-1",
      });
    });

    it("rejects replies to messages without a context", async () => {
      writeDataFile("private-messages.json", [message({ id: "orig", subjectType: undefined, subject: undefined })]);
      signInAs(cast.user);
      const response = await post({ message: "re", replyToId: "orig" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "messages.reply_context_missing" });
      expect(storedMessages()).toHaveLength(1);
    });
  });
});

describe("DELETE /api/messages", () => {
  async function remove(body: unknown) {
    return (await routes()).DELETE(jsonRequest(url, "DELETE", body));
  }

  beforeEach(() => {
    writeDataFile("private-messages.json", [
      message({ id: "root" }),
      message({
        id: "reply",
        replyToId: "root",
        threadId: "root",
        senderMemberId: cast.moderator.publicId,
        recipientMemberId: cast.user.publicId,
      }),
      message({ id: "nested", replyToId: "reply", threadId: "root" }),
      message({ id: "other", senderMemberId: cast.admin.publicId, recipientMemberId: cast.simpleAdmin.publicId }),
    ]);
  });

  it("rejects a missing message id", async () => {
    signInAs(cast.user);
    for (const body of ["{", [], { messageId: " " }, { messageId: 1 }]) {
      expect((await remove(body)).status).toBe(400);
    }
  });

  it("returns 404 for an unknown message", async () => {
    signInAs(cast.user);
    expect((await remove({ messageId: "missing" })).status).toBe(404);
  });

  it("forbids non-participants other than admins", async () => {
    for (const member of [cast.user, cast.moderator]) {
      signInAs(member);
      expect((await remove({ messageId: "other" })).status).toBe(403);
    }
    expect(storedMessages()).toHaveLength(4);
  });

  it("lets a participant delete a message and every reply below it", async () => {
    signInAs(cast.moderator);
    const response = await remove({ messageId: "reply" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deletedCount: 2 });
    expect(storedMessages().map((entry) => entry.id)).toEqual(["root", "other"]);
  });

  it("lets a simple-view admin delete only as a participant, and a real admin delete any message", async () => {
    signInAs(cast.simpleAdmin);
    expect((await remove({ messageId: "root" })).status).toBe(403);
    signInAs(cast.admin);
    expect(await (await remove({ messageId: "root" })).json()).toEqual({ ok: true, deletedCount: 3 });
    expect(storedMessages().map((entry) => entry.id)).toEqual(["other"]);
  });

  it("returns 404 if the message disappears before deletion", async () => {
    const store = await import("@/lib/private-messages-store");
    vi.spyOn(store, "deletePrivateMessageBranch").mockResolvedValue(0);
    signInAs(cast.user);
    expect((await remove({ messageId: "root" })).status).toBe(404);
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("private-messages.json", "[{}]");
    signInAs(cast.user);
    expect((await remove({ messageId: "root" })).status).toBe(503);
  });
});

describe("PATCH /api/messages", () => {
  async function patch(body: unknown) {
    return (await routes()).PATCH(jsonRequest(url, "PATCH", body));
  }

  it("rejects a missing or empty id list", async () => {
    signInAs(cast.user);
    for (const body of ["{", [], {}, { messageIds: [] }, { messageIds: [1, null] }]) {
      expect((await patch(body)).status).toBe(400);
    }
  });

  it("marks only the member's received messages as read", async () => {
    writeDataFile("private-messages.json", [
      message({ id: "mine", senderMemberId: cast.moderator.publicId, recipientMemberId: cast.user.publicId }),
      message({ id: "sent", senderMemberId: cast.user.publicId, recipientMemberId: cast.moderator.publicId }),
      message({ id: "untouched", senderMemberId: cast.moderator.publicId, recipientMemberId: cast.user.publicId }),
    ]);
    signInAs(cast.user);
    const response = await patch({ messageIds: ["mine", "sent", 7] });
    expect(response.status).toBe(200);
    expect(Object.fromEntries(storedMessages().map((entry) => [entry.id, entry.unread]))).toEqual({
      mine: false,
      sent: true,
      untouched: true,
    });
  });

  it("returns 503 when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("private-messages.json", "{broken");
    signInAs(cast.user);
    expect((await patch({ messageIds: ["x"] })).status).toBe(503);
  });
});
