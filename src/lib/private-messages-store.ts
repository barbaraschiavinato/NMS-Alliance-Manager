import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { readAccessData } from "@/lib/access-store";

export type PrivateMessage = Readonly<{
  id: string;
  threadId?: string;
  replyToId?: string;
  senderMemberId?: string;
  recipientMemberId?: string;
  body: string;
  subject?: string;
  subjectType?: "planet" | "mission";
  portal?: string;
  galaxy?: number;
  planetNumber?: number;
  missionCode?: string;
  createdAt: string;
}>;

type StoredPrivateMessage = PrivateMessage & Readonly<{
  senderEmail?: string;
  recipientEmail?: string;
}>;

const blobPath = "alliance-manager/private-messages.json";
const localPath = path.join(process.cwd(), "data", "private-messages.json");

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
      (!message.recipientMemberId && !message.recipientEmail) ||
      typeof message.body !== "string" ||
      (message.subject !== undefined && (typeof message.subject !== "string" || message.subject.length > 160)) ||
      (message.subjectType !== undefined && message.subjectType !== "planet" && message.subjectType !== "mission") ||
      (message.portal !== undefined && (typeof message.portal !== "string" || !/^[0-9A-F]{12}$/i.test(message.portal))) ||
      (message.galaxy !== undefined && (typeof message.galaxy !== "number" || !Number.isInteger(message.galaxy) || message.galaxy < 0 || message.galaxy > 255)) ||
      (message.planetNumber !== undefined && (typeof message.planetNumber !== "number" || !Number.isInteger(message.planetNumber) || message.planetNumber < 0 || message.planetNumber > 6)) ||
      (message.missionCode !== undefined && typeof message.missionCode !== "string") ||
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
    const senderMemberId = message.senderMemberId ??
      (senderEmail ? membersByEmail.get(senderEmail.trim().toLowerCase()) : undefined);
    const recipientMemberId = message.recipientMemberId ??
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
    createdAt: new Date().toISOString(),
  });
  await writeMessages(messages);
}
