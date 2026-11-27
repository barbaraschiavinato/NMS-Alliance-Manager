import { describe, expect, it } from "vitest";
import {
  eventsForTab,
  groupEventsByDay,
  isOngoingEvent,
  isPastEvent,
  normalizeStoredEvent,
  parseEventInput,
} from "@/lib/events/events";

const start = "2026-12-05T20:00:00.000Z";
const at = (iso: string) => Date.parse(iso);
const input = { type: "market", title: " Market ", description: " Bring eggs ", startsAt: start };

describe("event timing", () => {
  it("expires three hours after the start without an end time", () => {
    const event = { startsAt: start };
    expect(isOngoingEvent(event, at("2026-12-05T19:59:59Z"))).toBe(false);
    expect(isOngoingEvent(event, at(start))).toBe(true);
    expect(isPastEvent(event, at("2026-12-05T22:59:59Z"))).toBe(false);
    expect(isPastEvent(event, at("2026-12-05T23:00:00Z"))).toBe(true);
  });

  it("uses the end time when there is one", () => {
    const event = { startsAt: start, endsAt: "2026-12-06T10:00:00.000Z" };
    expect(isOngoingEvent(event, at("2026-12-06T09:00:00Z"))).toBe(true);
    expect(isOngoingEvent(event, at("2026-12-06T10:00:00Z"))).toBe(false);
  });

  it("sorts upcoming events soonest first, past ones newest first, and groups them by day", () => {
    const events = [
      { startsAt: "2026-12-07T12:00:00.000Z" },
      { startsAt: "2026-12-01T12:00:00.000Z" },
      { startsAt: "2026-12-06T12:00:00.000Z" },
      { startsAt: "2026-11-01T12:00:00.000Z" },
    ];
    const now = at("2026-12-05T00:00:00Z");
    expect(eventsForTab(events, "upcoming", now).map((event) => event.startsAt.slice(5, 10))).toEqual([
      "12-06",
      "12-07",
    ]);
    expect(eventsForTab(events, "past", now).map((event) => event.startsAt.slice(5, 10))).toEqual(["12-01", "11-01"]);
    const sameDay = [{ startsAt: "2026-12-05T11:00:00.000Z" }, { startsAt: "2026-12-05T12:00:00.000Z" }];
    expect(groupEventsByDay(sameDay)).toHaveLength(1);
  });
});

describe("parseEventInput", () => {
  it("trims the text and normalizes the instants", () => {
    expect(parseEventInput(input)).toEqual({
      input: { type: "market", title: "Market", description: "Bring eggs", startsAt: start },
    });
  });

  it.each([
    [{ type: "party" }, "events.error_type_required"],
    [{ title: " " }, "events.error_title_required"],
    [{ title: "x".repeat(81) }, "events.error_title_too_long"],
    [{ description: "" }, "events.error_description_required"],
    [{ description: "x".repeat(2001) }, "events.error_description_too_long"],
    [{ startsAt: "soon" }, "events.error_start_required"],
    [{ endsAt: "later" }, "events.error_invalid_end"],
    [{ endsAt: start }, "events.error_end_before_start"],
  ])("rejects %o", (override, error) => {
    expect(parseEventInput({ ...input, ...override })).toEqual({ error });
  });
});

describe("normalizeStoredEvent", () => {
  const stored = {
    id: "e1",
    creatorId: "m1",
    ...input,
    location: { kind: "portal", portal: "0123456789ab", galaxy: 0 },
  };

  it("drops invalid entries, duplicate participants and foreign image paths", () => {
    const event = normalizeStoredEvent({
      ...stored,
      imagePath: "alliance-manager/pets/x.png",
      participants: [{ memberId: "m1", status: "going" }, { memberId: "m1", status: "maybe" }, { memberId: "m2" }],
      messages: [{ id: "a", senderMemberId: "m1", body: " hi ", createdAt: start }, { id: "b" }],
    });
    expect(event?.imagePath).toBeUndefined();
    expect(event?.location.portal).toBe("0123456789AB");
    expect(event?.participants).toEqual([{ memberId: "m1", status: "going" }]);
    expect(event?.messages).toEqual([{ id: "a", senderMemberId: "m1", body: "hi", createdAt: start }]);
  });

  it("rejects an event without a valid location or creator", () => {
    expect(normalizeStoredEvent({ ...stored, location: { kind: "portal", portal: "12", galaxy: 0 } })).toBeNull();
    expect(normalizeStoredEvent({ ...stored, creatorId: "" })).toBeNull();
    expect(normalizeStoredEvent(null)).toBeNull();
  });
});
