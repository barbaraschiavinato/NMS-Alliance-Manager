import { decodePortalAddress } from "@/lib/missions/missions";
import { itemNameMaxLength } from "@/lib/utils/limits";

export const eventTypes = ["market", "gathering", "other"] as const;
export type EventType = (typeof eventTypes)[number];

export function isEventType(value: unknown): value is EventType {
  return eventTypes.includes(value as EventType);
}

export const eventLocationKinds = ["hub", "station", "portal"] as const;
export type EventLocationKind = (typeof eventLocationKinds)[number];

export const participationStatuses = ["going", "maybe"] as const;
export type ParticipationStatus = (typeof participationStatuses)[number];

export function isParticipationStatus(value: unknown): value is ParticipationStatus {
  return participationStatuses.includes(value as ParticipationStatus);
}

export const eventDescriptionMaxLength = 2000;
export const eventMessageMaxLength = 2000;

/** How long an event without an end time stays ongoing. */
export const eventDefaultDurationMs = 3 * 60 * 60 * 1000;

export const eventImagePathPattern = /^alliance-manager\/events\/[a-f0-9-]{36}\.(jpg|png|webp|avif)$/i;

// A snapshot taken when the event is saved: later changes to the hub or the station do not move the meeting.
export type EventLocation = Readonly<{ kind: EventLocationKind; portal: string; galaxy: number; name?: string }>;

export type EventParticipant = Readonly<{ memberId: string; status: ParticipationStatus }>;

// Replies stay one level deep: `replyToId` always points to a message without one.
export type EventMessage = Readonly<{
  id: string;
  replyToId?: string;
  senderMemberId: string;
  body: string;
  createdAt: string;
}>;

export type EventInput = Readonly<{
  type: EventType;
  title: string;
  description: string;
  startsAt: string;
  endsAt?: string;
}>;

export type AllianceEvent = EventInput &
  Readonly<{
    id: string;
    location: EventLocation;
    // Pathname of the stored image; the API exposes it as `imageUrl`.
    imagePath?: string;
    creatorId: string;
    participants: readonly EventParticipant[];
    messages: readonly EventMessage[];
    createdAt: string;
    updatedAt?: string;
  }>;

type EventTimes = Readonly<{ startsAt: string; endsAt?: string }>;

export function eventEndTime(event: EventTimes): number {
  return event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + eventDefaultDurationMs;
}

export function isPastEvent(event: EventTimes, now: number): boolean {
  return now >= eventEndTime(event);
}

export function isOngoingEvent(event: EventTimes, now: number): boolean {
  return Date.parse(event.startsAt) <= now && !isPastEvent(event, now);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: unknown): string {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// Validates a create/update payload (the location is resolved by the route); returns the key of the first error.
export function parseEventInput(value: unknown): { input: EventInput } | { error: string } {
  const payload = asRecord(value);
  const title = text(payload.title);
  const description = text(payload.description);
  const startsAt = isoDate(payload.startsAt);
  const endsAt = isoDate(payload.endsAt);
  if (!isEventType(payload.type)) return { error: "events.error_type_required" };
  if (!title) return { error: "events.error_title_required" };
  if (title.length > itemNameMaxLength) return { error: "events.error_title_too_long" };
  if (!description) return { error: "events.error_description_required" };
  if (description.length > eventDescriptionMaxLength) return { error: "events.error_description_too_long" };
  if (!startsAt) return { error: "events.error_start_required" };
  if (text(payload.endsAt) && !endsAt) return { error: "events.error_invalid_end" };
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { error: "events.error_end_before_start" };
  return { input: { type: payload.type, title, description, startsAt, ...(endsAt ? { endsAt } : {}) } };
}

export function parseEventCoordinates(portal: unknown, galaxy: unknown): { portal: string; galaxy: number } | null {
  const code = text(portal).toUpperCase();
  const decoded = decodePortalAddress(code);
  if (decoded?.kind !== "portal" || decoded.errors.length > 0) return null;
  if (typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) return null;
  return { portal: code, galaxy };
}

function normalizeLocation(value: unknown): EventLocation | null {
  const entry = asRecord(value);
  const coordinates = parseEventCoordinates(entry.portal, entry.galaxy);
  if (!coordinates || !eventLocationKinds.includes(entry.kind as EventLocationKind)) return null;
  const name = text(entry.name);
  return { kind: entry.kind as EventLocationKind, ...coordinates, ...(name ? { name } : {}) };
}

function uniqueBy<T>(entries: readonly (T | null)[], key: (entry: T) => string): T[] {
  const seen = new Set<string>();
  return entries.filter((entry): entry is T => {
    if (!entry || seen.has(key(entry))) return false;
    seen.add(key(entry));
    return true;
  });
}

// Lenient reader for stored documents: drops invalid entries instead of failing the whole list.
export function normalizeStoredEvent(value: unknown): AllianceEvent | null {
  const entry = asRecord(value);
  const id = text(entry.id);
  const creatorId = text(entry.creatorId);
  const title = text(entry.title).slice(0, itemNameMaxLength);
  const startsAt = isoDate(entry.startsAt);
  const endsAt = isoDate(entry.endsAt);
  const location = normalizeLocation(entry.location);
  if (!id || !creatorId || !title || !startsAt || !location || !isEventType(entry.type)) return null;
  const participants = uniqueBy(
    (Array.isArray(entry.participants) ? entry.participants : []).map((value_): EventParticipant | null => {
      const participant = asRecord(value_);
      const memberId = text(participant.memberId);
      return memberId && isParticipationStatus(participant.status) ? { memberId, status: participant.status } : null;
    }),
    (participant) => participant.memberId,
  );
  const messages = uniqueBy(
    (Array.isArray(entry.messages) ? entry.messages : []).map((value_): EventMessage | null => {
      const message = asRecord(value_);
      const messageId = text(message.id);
      const senderMemberId = text(message.senderMemberId);
      const body = text(message.body).slice(0, eventMessageMaxLength);
      const createdAt = isoDate(message.createdAt);
      const replyToId = text(message.replyToId);
      return messageId && senderMemberId && body && createdAt
        ? { id: messageId, ...(replyToId ? { replyToId } : {}), senderMemberId, body, createdAt }
        : null;
    }),
    (message) => message.id,
  );
  // A reply whose message is gone is dropped with it.
  const rootIds = new Set(messages.filter((message) => !message.replyToId).map((message) => message.id));
  const imagePath = text(entry.imagePath);
  const updatedAt = isoDate(entry.updatedAt);
  return {
    id,
    type: entry.type,
    title,
    description: text(entry.description).slice(0, eventDescriptionMaxLength),
    startsAt,
    ...(endsAt && Date.parse(endsAt) > Date.parse(startsAt) ? { endsAt } : {}),
    location,
    ...(eventImagePathPattern.test(imagePath) ? { imagePath } : {}),
    creatorId,
    participants,
    messages: messages.filter((message) => !message.replyToId || rootIds.has(message.replyToId)),
    createdAt: isoDate(entry.createdAt) || new Date(0).toISOString(),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export type EventTab = "upcoming" | "past";

/** Upcoming events soonest first (ongoing ones included), past events newest first. */
export function eventsForTab<T extends EventTimes>(events: readonly T[], tab: EventTab, now: number): T[] {
  const direction = tab === "upcoming" ? 1 : -1;
  return events
    .filter((event) => isPastEvent(event, now) === (tab === "past"))
    .sort((left, right) => direction * (Date.parse(left.startsAt) - Date.parse(right.startsAt)));
}

/** Groups already sorted events by the viewer's local day. */
export function groupEventsByDay<T extends EventTimes>(events: readonly T[]): Readonly<{ day: string; events: T[] }>[] {
  const groups: { day: string; events: T[] }[] = [];
  for (const event of events) {
    const day = new Date(event.startsAt).toDateString();
    const last = groups.at(-1);
    if (last?.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}
