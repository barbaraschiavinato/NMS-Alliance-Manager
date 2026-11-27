"use client";

import { useSyncExternalStore } from "react";
import { HeroAddButton } from "@/components/layout/hero";
import { EventCard } from "@/components/cards/event-card";
import { EventDayList } from "@/components/sections/event-day-list";
import type { EventView } from "@/lib/events/event-views";

const noop = () => undefined;
const subscribe = () => noop;
// A fixed "now", so the example never becomes ongoing or past.
const now = Date.parse("2026-12-01T12:00:00.000Z");

const eventExample: EventView = {
  id: "guide-event",
  type: "market",
  title: "Mercatino d'inverno",
  description: "Portate uova, moduli e tutto quello che volete scambiare.",
  startsAt: "2026-12-05T20:00:00.000Z",
  createdAt: "2026-11-27T10:00:00.000Z",
  location: { kind: "hub", portal: "1234F5E6D7C8", galaxy: 0 },
  stationHref: "/stations",
  creatorId: "guide-member",
  creatorName: "Viaggiatore",
  canManage: true,
  myStatus: "going",
  participants: [
    { memberId: "guide-member", name: "Viaggiatore", status: "going" },
    { memberId: "guide-other", name: "Nova", status: "maybe" },
  ],
  messages: [],
};

// Inert examples: they show the section without links or actions.
export function EventExamples() {
  // Dates use the viewer's time zone, which the server does not know: the examples are drawn in the browser only.
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return null;
  return (
    <div className="guide-examples" inert>
      <HeroAddButton label="events.add_event" onClick={noop} />
      <EventDayList events={[eventExample]} now={now} />
      <ul className="event-list event-detail-list">
        <EventCard
          currentMemberId="guide-member"
          event={eventExample}
          now={now}
          onDuplicate={noop}
          onEdit={noop}
          onRemove={noop}
        />
      </ul>
    </div>
  );
}
