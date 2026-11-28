import { randomUUID } from "node:crypto";
import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import { memoizedRead } from "@/lib/storage/request-memo";
import {
  normalizeStoredEvent,
  type AllianceEvent,
  type EventInput,
  type EventLocation,
  type ParticipationStatus,
} from "@/lib/events/events";

export function readEvents(): Promise<AllianceEvent[]> {
  return memoizedRead("events", readEventsFromStore);
}

async function readEventsFromStore(): Promise<AllianceEvent[]> {
  const raw = await readJsonDocument("events");
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const event = normalizeStoredEvent(entry);
    if (!event || seen.has(event.id)) return [];
    seen.add(event.id);
    return [event];
  });
}

function writeEvents(events: readonly AllianceEvent[]): Promise<void> {
  return writeJsonDocument("events", events);
}

// Applies `change` to one event and saves it; null when the event no longer exists.
async function changeEvent(id: string, change: (event: AllianceEvent) => AllianceEvent): Promise<AllianceEvent | null> {
  const events = await readEvents();
  const current = events.find((event) => event.id === id);
  if (!current) return null;
  const updated = change(current);
  await writeEvents(events.map((event) => (event.id === id ? updated : event)));
  return updated;
}

export async function addEvent(
  input: EventInput,
  location: EventLocation,
  creatorId: string,
  imagePath?: string,
): Promise<AllianceEvent> {
  const events = await readEvents();
  const event: AllianceEvent = {
    id: randomUUID(),
    ...input,
    location,
    ...(imagePath ? { imagePath } : {}),
    creatorId,
    participants: [],
    messages: [],
    createdAt: new Date().toISOString(),
  };
  await writeEvents([...events, event]);
  return event;
}

// `imagePath` undefined keeps the stored image, null removes it, a string replaces it.
export function updateEvent(
  id: string,
  input: EventInput,
  location: EventLocation,
  imagePath?: string | null,
): Promise<AllianceEvent | null> {
  return changeEvent(id, (current) => {
    const nextImagePath = imagePath === undefined ? current.imagePath : (imagePath ?? undefined);
    return {
      id: current.id,
      ...input,
      location,
      ...(nextImagePath ? { imagePath: nextImagePath } : {}),
      creatorId: current.creatorId,
      participants: current.participants,
      messages: current.messages,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function removeEvent(id: string): Promise<void> {
  await writeEvents((await readEvents()).filter((event) => event.id !== id));
}

/** `status` null withdraws the answer. */
export function setParticipation(
  id: string,
  memberId: string,
  status: ParticipationStatus | null,
): Promise<AllianceEvent | null> {
  return changeEvent(id, (event) => {
    const others = event.participants.filter((participant) => participant.memberId !== memberId);
    return { ...event, participants: status ? [...others, { memberId, status }] : others };
  });
}

/** A reply to a reply joins the same thread. */
export function addEventMessage(
  id: string,
  senderMemberId: string,
  body: string,
  replyToId?: string,
): Promise<AllianceEvent | null> {
  return changeEvent(id, (event) => {
    const parent = event.messages.find((message) => message.id === replyToId);
    const rootId = parent?.replyToId ?? parent?.id;
    return {
      ...event,
      messages: [
        ...event.messages,
        {
          id: randomUUID(),
          ...(rootId ? { replyToId: rootId } : {}),
          senderMemberId,
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });
}

/** Removing a message removes its replies too. */
export function removeEventMessage(id: string, messageId: string): Promise<AllianceEvent | null> {
  return changeEvent(id, (event) => ({
    ...event,
    messages: event.messages.filter((message) => message.id !== messageId && message.replyToId !== messageId),
  }));
}
