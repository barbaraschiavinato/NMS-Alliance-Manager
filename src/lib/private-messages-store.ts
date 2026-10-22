import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { localDataPath } from "@/lib/local-data-path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { readAccessData } from "@/lib/access-store";

export type MeetingStation = Readonly<{ portal: string; galaxy: number; name?: string }>;
export type TaxiStationOption = MeetingStation & Readonly<{ id: string }>;
export type BroadcastKind = "help" | "taxi";
export type TaxiMeetingPoint = "offline" | "arrange" | "hub" | "station";

export type PrivateMessage = Readonly<{
  id: string;
  threadId?: string;
  replyToId?: string;
  senderMemberId?: string;
  recipientMemberId?: string;
  body: string;
  subject?: string;
  subjectType?: "planet" | "mission" | "help" | "taxi";
  meetingStation?: MeetingStation;
  meetingPoint?: TaxiMeetingPoint;
  portal?: string;
  galaxy?: number;
  planetNumber?: number;
  missionCode?: string;
  unread?: boolean;
  archived?: boolean;
  createdAt: string;
}>;

type StoredPrivateMessage = PrivateMessage &
  Readonly<{
    senderEmail?: string;
    recipientEmail?: string;
  }>;

const blobPath = "alliance-manager/private-messages.json";
const localPath = localDataPath("private-messages.json");

function parseMessages(value: unknown): StoredPrivateMessage[] {
  if (!Array.isArray(value)) throw new Error("Invalid private message storage format.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Invalid private message in storage.");
    }
    const message = entry as Partial<StoredPrivateMessage>;
    if (
      typeof message.id !== "string" ||
      (message.threadId !== undefined && typeof message.threadId !== "string") ||
      (message.replyToId !== undefined && typeof message.replyToId !== "string") ||
      (message.senderMemberId !== undefined && typeof message.senderMemberId !== "string") ||
      (message.recipientMemberId !== undefined && typeof message.recipientMemberId !== "string") ||
      (message.senderEmail !== undefined && typeof message.senderEmail !== "string") ||
      (message.recipientEmail !== undefined && typeof message.recipientEmail !== "string") ||
      (!message.senderMemberId && !message.senderEmail) ||
      (!message.recipientMemberId &&
        !message.recipientEmail &&
        message.subjectType !== "help" &&
        message.subjectType !== "taxi") ||
      typeof message.body !== "string" ||
      (message.meetingPoint !== undefined &&
        message.meetingPoint !== "offline" &&
        message.meetingPoint !== "arrange" &&
        message.meetingPoint !== "hub" &&
        message.meetingPoint !== "station") ||
      (message.subject !== undefined && (typeof message.subject !== "string" || message.subject.length > 160)) ||
      (message.subjectType !== undefined &&
        message.subjectType !== "planet" &&
        message.subjectType !== "mission" &&
        message.subjectType !== "help" &&
        message.subjectType !== "taxi") ||
      (message.meetingStation !== undefined &&
        (!message.meetingStation ||
          typeof message.meetingStation !== "object" ||
          typeof message.meetingStation.portal !== "string" ||
          !/^[0-9A-F]{12}$/i.test(message.meetingStation.portal) ||
          !Number.isInteger(message.meetingStation.galaxy) ||
          message.meetingStation.galaxy < 0 ||
          message.meetingStation.galaxy > 255 ||
          (message.meetingStation.name !== undefined && typeof message.meetingStation.name !== "string"))) ||
      (message.portal !== undefined &&
        (typeof message.portal !== "string" || !/^[0-9A-F]{12}$/i.test(message.portal))) ||
      (message.galaxy !== undefined &&
        (typeof message.galaxy !== "number" ||
          !Number.isInteger(message.galaxy) ||
          message.galaxy < 0 ||
          message.galaxy > 255)) ||
      (message.planetNumber !== undefined &&
        (typeof message.planetNumber !== "number" ||
          !Number.isInteger(message.planetNumber) ||
          message.planetNumber < 0 ||
          message.planetNumber > 6)) ||
      (message.missionCode !== undefined && typeof message.missionCode !== "string") ||
      (message.unread !== undefined && typeof message.unread !== "boolean") ||
      (message.archived !== undefined && typeof message.archived !== "boolean") ||
      typeof message.createdAt !== "string"
    ) {
      throw new Error("Invalid private message in storage.");
    }
    return message as StoredPrivateMessage;
  });
}

async function readMessages(): Promise<PrivateMessage[]> {
  const blobAuthOptions = getBlobAuthOptions();
  let stored: StoredPrivateMessage[];
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return [];
    stored = parseMessages(JSON.parse(await new Response(blob.stream).text()));
  } else {
    try {
      stored = parseMessages(JSON.parse(await readFile(localPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  const access = await readAccessData();
  const membersByEmail = new Map(access.members.map((member) => [member.email.toLowerCase(), member.publicId]));
  let needsMigration = false;
  const messages = stored.map(({ senderEmail, recipientEmail, ...message }) => {
    const senderMemberId =
      message.senderMemberId ?? (senderEmail ? membersByEmail.get(senderEmail.trim().toLowerCase()) : undefined);
    const recipientMemberId =
      message.recipientMemberId ??
      (recipientEmail ? membersByEmail.get(recipientEmail.trim().toLowerCase()) : undefined);
    if (senderEmail !== undefined || recipientEmail !== undefined) needsMigration = true;
    return {
      ...message,
      ...(senderMemberId ? { senderMemberId } : {}),
      ...(recipientMemberId ? { recipientMemberId } : {}),
    };
  });
  if (needsMigration) await writeMessages(messages);
  return messages;
}

export async function readPrivateMessages(): Promise<PrivateMessage[]> {
  return readMessages();
}

export async function readHelpRequests(kind: BroadcastKind = "help"): Promise<PrivateMessage[]> {
  return (await readMessages()).filter((message) => message.subjectType === kind);
}

export async function deleteHelpRequest(requestId: string, kind: BroadcastKind = "help"): Promise<boolean> {
  const messages = await readMessages();
  const retained = messages.filter(
    (message) => !(message.subjectType === kind && (message.id === requestId || message.threadId === requestId)),
  );
  if (retained.length === messages.length) return false;
  await writeMessages(retained);
  return true;
}

export async function setHelpRequestArchived(
  requestId: string,
  archived: boolean,
  kind: BroadcastKind,
): Promise<boolean> {
  const messages = await readMessages();
  const index = messages.findIndex(
    (message) => message.id === requestId && message.subjectType === kind && !message.replyToId,
  );
  if (index < 0) return false;
  messages[index] = { ...messages[index], archived };
  await writeMessages(messages);
  return true;
}

export async function saveHelpReply(
  senderMemberId: string,
  body: string,
  requestId: string,
  kind: BroadcastKind = "help",
): Promise<boolean | "archived"> {
  const messages = await readMessages();
  const request = messages.find(
    (message) => message.id === requestId && message.subjectType === kind && !message.replyToId,
  );
  if (!request) return false;
  if (request.archived) return "archived";
  messages.push({
    id: randomUUID(),
    threadId: request.id,
    replyToId: request.id,
    senderMemberId: senderMemberId.trim(),
    body,
    subjectType: kind,
    createdAt: new Date().toISOString(),
  });
  await writeMessages(messages);
  return true;
}

export async function deletePrivateMessageBranch(messageId: string): Promise<number> {
  const messages = await readMessages();
  if (!messages.some((message) => message.id === messageId)) return 0;

  const deletedIds = new Set([messageId]);
  let foundReply = true;
  while (foundReply) {
    foundReply = false;
    for (const message of messages) {
      if (message.replyToId && deletedIds.has(message.replyToId) && !deletedIds.has(message.id)) {
        deletedIds.add(message.id);
        foundReply = true;
      }
    }
  }

  const retainedMessages = messages.filter((message) => !deletedIds.has(message.id));
  await writeMessages(retainedMessages);
  return deletedIds.size;
}

async function writeMessages(messages: PrivateMessage[]): Promise<void> {
  const json = `${JSON.stringify(messages, null, 2)}\n`;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(blobPath, json, {
      access: "private",
      ...blobAuthOptions,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, json, "utf8");
}

export async function savePrivateMessage(
  senderMemberId: string,
  recipientMemberId: string,
  body: string,
  context: Readonly<
    | { subjectType: "planet"; subject: string; portal: string; galaxy: number; planetNumber: number }
    | { subjectType: "mission"; subject: string; missionCode: string }
  >,
  relation?: Readonly<{ threadId?: string; replyToId?: string }>,
): Promise<void> {
  const messages = await readMessages();
  const id = randomUUID();
  messages.push({
    id,
    threadId: relation?.threadId ?? id,
    ...(relation?.replyToId ? { replyToId: relation.replyToId } : {}),
    senderMemberId: senderMemberId.trim(),
    recipientMemberId: recipientMemberId.trim(),
    body,
    ...context,
    unread: true,
    createdAt: new Date().toISOString(),
  });
  await writeMessages(messages);
}

export async function saveHelpRequest(
  senderMemberId: string,
  body: string,
  context:
    | Readonly<{ subject: string; portal: string; galaxy: number }>
    | Readonly<{
        subject: string;
        galaxy: number;
        meetingStation?: MeetingStation;
        meetingPoint?: TaxiMeetingPoint;
        subjectType: "taxi";
      }>,
): Promise<string> {
  const messages = await readMessages();
  const id = randomUUID();
  messages.push({
    id,
    threadId: id,
    senderMemberId: senderMemberId.trim(),
    body,
    subjectType: "help",
    ...context,
    createdAt: new Date().toISOString(),
  });
  await writeMessages(messages);
  return id;
}

export async function reassignPrivateMessageMember(fromMemberId: string, toMemberId: string): Promise<void> {
  const messages = await readMessages();
  await writeMessages(
    messages.map((message) => ({
      ...message,
      ...(message.senderMemberId === fromMemberId ? { senderMemberId: toMemberId } : {}),
      ...(message.recipientMemberId === fromMemberId ? { recipientMemberId: toMemberId } : {}),
    })),
  );
}

export async function markPrivateMessagesRead(memberId: string, messageIds: readonly string[]): Promise<void> {
  const ids = new Set(messageIds);
  const messages = await readMessages();
  let changed = false;
  const updated = messages.map((message) => {
    if (!message.unread || message.recipientMemberId !== memberId || !ids.has(message.id)) return message;
    changed = true;
    return { ...message, unread: false };
  });
  if (changed) await writeMessages(updated);
}
