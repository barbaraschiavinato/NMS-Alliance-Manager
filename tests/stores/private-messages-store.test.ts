import { mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  readBlobJson,
  readDataFile,
  readRawDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/private-messages-store");
const fileName = "private-messages.json";
const blobPath = "alliance-manager/private-messages.json";
const now = "2026-05-01T12:00:00.000Z";

function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "m1",
    threadId: "m1",
    senderMemberId: "sender",
    recipientMemberId: "recipient",
    body: "hello",
    subject: "Subject",
    subjectType: "planet",
    portal: "0123456789AB",
    galaxy: 0,
    planetNumber: 1,
    unread: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function help(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "h1",
    threadId: "h1",
    senderMemberId: "sender",
    body: "help me",
    subjectType: "help",
    subject: "Stuck",
    portal: "0123456789AB",
    galaxy: 0,
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

const storedMessages = () => readDataFile(fileName) as Record<string, unknown>[];

beforeEach(() => {
  resetStores();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading (local filesystem)", () => {
  it("rejects unknown taxi meeting point kinds", async () => {
    writeDataFile(fileName, [help({ subjectType: "taxi", meetingPoint: "unknown" })]);
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toThrow("Invalid private message in storage.");
  });
  it.each([
    null,
    [],
    { portal: 1, galaxy: 0 },
    { portal: "bad", galaxy: 0 },
    { portal: "0123456789AB", galaxy: -1 },
    { portal: "0123456789AB", galaxy: 256 },
    { portal: "0123456789AB", galaxy: 1.5 },
    { portal: "0123456789AB", galaxy: 0, name: 1 },
  ])("rejects invalid taxi meeting stations: %j", async (meetingStation) => {
    writeDataFile(fileName, [help({ subjectType: "taxi", meetingStation })]);
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toThrow("Invalid private message in storage.");
  });

  it("returns no messages when the file does not exist", async () => {
    const { readPrivateMessages, readHelpRequests } = await load();
    expect(await readPrivateMessages()).toEqual([]);
    expect(await readHelpRequests()).toEqual([]);
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("rethrows malformed JSON", async () => {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(`${dataDir()}/${fileName}`, "[{");
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toThrow(SyntaxError);
  });

  it("rethrows non-ENOENT read errors", async () => {
    mkdirSync(`${dataDir()}/${fileName}`, { recursive: true });
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("rejects a non-array document", async () => {
    writeDataFile(fileName, { messages: [] });
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toThrow("Invalid private message storage format.");
  });

  it("reads valid messages without rewriting the file", async () => {
    const stored = [
      message(),
      message({
        id: "m2",
        replyToId: "m1",
        subjectType: "mission",
        missionCode: "ABC",
        portal: undefined,
        galaxy: undefined,
        planetNumber: undefined,
        unread: false,
      }),
      help(),
      { id: "m3", senderMemberId: "s", recipientMemberId: "r", body: "", createdAt: "x" },
    ];
    writeDataFile(fileName, stored);
    const before = readRawDataFile(fileName);
    const { readPrivateMessages, readHelpRequests } = await load();
    expect(await readPrivateMessages()).toEqual(JSON.parse(before));
    expect((await readHelpRequests()).map((item) => item.id)).toEqual(["h1"]);
    expect(readRawDataFile(fileName)).toBe(before);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "message"],
    ["a missing id", message({ id: undefined })],
    ["a non-string threadId", message({ threadId: 1 })],
    ["a non-string replyToId", message({ replyToId: 1 })],
    ["a non-string senderMemberId", message({ senderMemberId: 1 })],
    ["a non-string recipientMemberId", message({ recipientMemberId: 1 })],
    ["a non-string senderEmail", message({ senderEmail: 1 })],
    ["a non-string recipientEmail", message({ recipientEmail: 1 })],
    ["no sender", message({ senderMemberId: undefined })],
    ["no recipient outside help requests", message({ recipientMemberId: "" })],
    ["a non-string body", message({ body: 1 })],
    ["a non-string subject", message({ subject: 1 })],
    ["a subject over 160 characters", message({ subject: "s".repeat(161) })],
    ["an unknown subjectType", message({ subjectType: "chat" })],
    ["a non-string portal", message({ portal: 1 })],
    ["an invalid portal", message({ portal: "0123" })],
    ["a non-number galaxy", message({ galaxy: "0" })],
    ["a fractional galaxy", message({ galaxy: 0.5 })],
    ["a negative galaxy", message({ galaxy: -1 })],
    ["a galaxy above 255", message({ galaxy: 256 })],
    ["a non-number planet", message({ planetNumber: "1" })],
    ["a fractional planet", message({ planetNumber: 1.5 })],
    ["a negative planet", message({ planetNumber: -1 })],
    ["a planet above 6", message({ planetNumber: 7 })],
    ["a non-string mission code", message({ missionCode: 1 })],
    ["a non-boolean unread flag", message({ unread: "yes" })],
    ["a missing createdAt", message({ createdAt: undefined })],
  ])("rejects a stored message with %s", async (_label, entry) => {
    writeDataFile(fileName, [message({ id: "ok" }), entry]);
    const { readPrivateMessages } = await load();
    await expect(readPrivateMessages()).rejects.toThrow("Invalid private message in storage.");
  });

  it("accepts boundary values", async () => {
    writeDataFile(fileName, [
      message({ subject: "s".repeat(160), galaxy: 255, planetNumber: 6, portal: "abcdef123456" }),
    ]);
    const { readPrivateMessages } = await load();
    expect(await readPrivateMessages()).toHaveLength(1);
  });
});

describe("legacy email migration", () => {
  it("replaces sender and recipient emails with member ids and writes back", async () => {
    const sender = makeMember({ email: "sender@example.com" });
    const recipient = makeMember({ email: "recipient@example.com" });
    seedMembers([sender, recipient]);
    writeDataFile(fileName, [
      message({
        senderMemberId: undefined,
        recipientMemberId: undefined,
        senderEmail: " SENDER@example.com ",
        recipientEmail: "Recipient@Example.com",
      }),
      help({ senderMemberId: undefined, senderEmail: "sender@example.com" }),
    ]);
    const { readPrivateMessages } = await load();
    const messages = await readPrivateMessages();
    expect(messages[0]).toEqual(message({ senderMemberId: sender.publicId, recipientMemberId: recipient.publicId }));
    expect(messages[1]).toEqual(help({ senderMemberId: sender.publicId }));
    expect(storedMessages()).toEqual(messages);
  });

  it("keeps existing member ids over legacy emails", async () => {
    const other = makeMember({ email: "other@example.com" });
    seedMembers([other]);
    writeDataFile(fileName, [message({ senderEmail: "other@example.com", recipientEmail: "other@example.com" })]);
    const { readPrivateMessages } = await load();
    expect((await readPrivateMessages())[0]).toEqual(message());
    expect(storedMessages()[0]).not.toHaveProperty("senderEmail");
  });

  it("drops legacy emails that match no member instead of inventing a member id", async () => {
    seedMembers([]);
    writeDataFile(fileName, [help({ senderMemberId: undefined, senderEmail: "gone@example.com" })]);
    const { readHelpRequests } = await load();
    const [request] = await readHelpRequests();
    expect(request).toEqual(help({ senderMemberId: undefined }));
    expect(request).not.toHaveProperty("senderMemberId");
    expect(request).not.toHaveProperty("senderEmail");
  });

  it.todo(
    "keeps messages readable when a legacy sender/recipient email has no matching member (currently the migrated record fails validation on the next read, see report)",
  );
});

describe("help requests", () => {
  it("saves a help request with a new thread", async () => {
    const { saveHelpRequest, readHelpRequests } = await load();
    await saveHelpRequest(" sender ", "body", { subject: "Need help", portal: "0123456789AB", galaxy: 2 });
    const [request] = await readHelpRequests();
    expect(request).toEqual({
      id: expect.any(String),
      threadId: request.id,
      senderMemberId: "sender",
      body: "body",
      subjectType: "help",
      subject: "Need help",
      portal: "0123456789AB",
      galaxy: 2,
      createdAt: now,
    });
  });

  it("adds a reply to a top-level help request", async () => {
    writeDataFile(fileName, [help()]);
    const { saveHelpReply, readPrivateMessages } = await load();
    expect(await saveHelpReply(" helper ", "on my way", "h1")).toBe(true);
    const messages = await readPrivateMessages();
    expect(messages[1]).toEqual({
      id: expect.any(String),
      threadId: "h1",
      replyToId: "h1",
      senderMemberId: "helper",
      body: "on my way",
      subjectType: "help",
      createdAt: now,
    });
  });

  it("refuses replies to unknown requests, non-help messages and replies", async () => {
    writeDataFile(fileName, [help(), help({ id: "r1", replyToId: "h1" }), message()]);
    const before = readRawDataFile(fileName);
    const { saveHelpReply } = await load();
    expect(await saveHelpReply("x", "b", "missing")).toBe(false);
    expect(await saveHelpReply("x", "b", "r1")).toBe(false);
    expect(await saveHelpReply("x", "b", "m1")).toBe(false);
    expect(readRawDataFile(fileName)).toBe(before);
  });

  it("deletes a request together with its thread", async () => {
    writeDataFile(fileName, [
      help(),
      help({ id: "r1", replyToId: "h1" }),
      help({ id: "h2", threadId: "h2" }),
      message({ id: "h1-planet", threadId: "h1" }),
    ]);
    const { deleteHelpRequest, readPrivateMessages } = await load();
    expect(await deleteHelpRequest("h1")).toBe(true);
    expect((await readPrivateMessages()).map((item) => item.id)).toEqual(["h2", "h1-planet"]);
  });

  it("returns false and does not write when nothing matches", async () => {
    writeDataFile(fileName, [message()]);
    const before = readRawDataFile(fileName);
    const { deleteHelpRequest } = await load();
    expect(await deleteHelpRequest("m1")).toBe(false);
    expect(readRawDataFile(fileName)).toBe(before);
  });
});

describe("private messages", () => {
  it("saves a new planet message as an unread thread root", async () => {
    const { savePrivateMessage, readPrivateMessages } = await load();
    await savePrivateMessage(" s ", " r ", "hi", {
      subjectType: "planet",
      subject: "Planet",
      portal: "0123456789AB",
      galaxy: 1,
      planetNumber: 2,
    });
    const [saved] = await readPrivateMessages();
    expect(saved).toEqual({
      id: expect.any(String),
      threadId: saved.id,
      senderMemberId: "s",
      recipientMemberId: "r",
      body: "hi",
      subjectType: "planet",
      subject: "Planet",
      portal: "0123456789AB",
      galaxy: 1,
      planetNumber: 2,
      unread: true,
      createdAt: now,
    });
  });

  it("saves a mission reply inside an existing thread", async () => {
    writeDataFile(fileName, [message()]);
    const { savePrivateMessage, readPrivateMessages } = await load();
    await savePrivateMessage(
      "r",
      "s",
      "re",
      { subjectType: "mission", subject: "M", missionCode: "X1" },
      { threadId: "m1", replyToId: "m1" },
    );
    await savePrivateMessage("r", "s", "re2", { subjectType: "mission", subject: "M", missionCode: "X1" }, {});
    const [, reply, standalone] = await readPrivateMessages();
    expect(reply).toMatchObject({ threadId: "m1", replyToId: "m1", missionCode: "X1", unread: true });
    expect(standalone.threadId).toBe(standalone.id);
    expect(standalone).not.toHaveProperty("replyToId");
  });

  it("deletes a message and all transitive replies", async () => {
    writeDataFile(fileName, [
      message({ id: "a" }),
      // Le risposte possono comparire prima del loro genitore nell'array.
      message({ id: "c", replyToId: "b" }),
      message({ id: "b", replyToId: "a" }),
      message({ id: "d", replyToId: "x" }),
      message({ id: "x" }),
    ]);
    const { deletePrivateMessageBranch, readPrivateMessages } = await load();
    expect(await deletePrivateMessageBranch("a")).toBe(3);
    expect((await readPrivateMessages()).map((item) => item.id)).toEqual(["d", "x"]);
  });

  it("returns 0 and does not write for an unknown message", async () => {
    writeDataFile(fileName, [message()]);
    const before = readRawDataFile(fileName);
    const { deletePrivateMessageBranch } = await load();
    expect(await deletePrivateMessageBranch("missing")).toBe(0);
    expect(readRawDataFile(fileName)).toBe(before);
  });

  it("reassigns sender and recipient references", async () => {
    writeDataFile(fileName, [
      message({ id: "1", senderMemberId: "from", recipientMemberId: "x" }),
      message({ id: "2", senderMemberId: "x", recipientMemberId: "from" }),
      help({ id: "3", senderMemberId: "from" }),
      message({ id: "4", senderMemberId: "x", recipientMemberId: "y" }),
    ]);
    const { reassignPrivateMessageMember, readPrivateMessages } = await load();
    await reassignPrivateMessageMember("from", "to");
    expect((await readPrivateMessages()).map((item) => [item.senderMemberId, item.recipientMemberId])).toEqual([
      ["to", "x"],
      ["x", "to"],
      ["to", undefined],
      ["x", "y"],
    ]);
  });

  it("marks only the recipient's unread selected messages as read", async () => {
    writeDataFile(fileName, [
      message({ id: "1", recipientMemberId: "me", unread: true }),
      message({ id: "2", recipientMemberId: "me", unread: true }),
      message({ id: "3", recipientMemberId: "someone", unread: true }),
      message({ id: "4", recipientMemberId: "me", unread: false }),
      message({ id: "5", recipientMemberId: "me", unread: undefined }),
    ]);
    const { markPrivateMessagesRead, readPrivateMessages } = await load();
    await markPrivateMessagesRead("me", ["1", "3", "4", "5"]);
    expect((await readPrivateMessages()).map((item) => item.unread)).toEqual([false, true, true, false, undefined]);
  });

  it("does not write when no message changes", async () => {
    writeDataFile(fileName, [message({ recipientMemberId: "me", unread: false })]);
    const before = readRawDataFile(fileName);
    const { markPrivateMessagesRead } = await load();
    await markPrivateMessagesRead("me", ["m1"]);
    expect(readRawDataFile(fileName)).toBe(before);
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("returns no messages for a missing or 304 blob", async () => {
    const { readPrivateMessages } = await load();
    expect(await readPrivateMessages()).toEqual([]);
    expect(blobMock.get).toHaveBeenCalledWith(blobPath, blobReadOptions());
    setBlobJson(blobPath, [message()]);
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await readPrivateMessages()).toEqual([]);
    expect(await readPrivateMessages()).toEqual([message()]);
  });

  it("migrates legacy emails and writes private JSON", async () => {
    const sender = makeMember({ email: "sender@example.com" });
    setBlobJson("alliance-manager/access.json", { members: [sender] });
    setBlobJson(blobPath, [help({ senderMemberId: undefined, senderEmail: "sender@example.com" })]);
    const { readHelpRequests } = await load();
    expect((await readHelpRequests())[0].senderMemberId).toBe(sender.publicId);
    expect(blobMock.put).toHaveBeenCalledWith(blobPath, expect.any(String), blobWriteOptions());
    expect(readBlobJson(blobPath)).toEqual([help({ senderMemberId: sender.publicId })]);
    expect(dataFileExists(fileName)).toBe(false);
  });
});
