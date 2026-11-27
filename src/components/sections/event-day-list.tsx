"use client";

import { CheckIcon } from "@/components/shared/icons";
import { DetailLink } from "@/components/shared/detail-page";
import { EventTypeIcon } from "@/components/shared/event-type-icon";
import { useLocale } from "@/components/providers/locale-provider";
import { eventLocationLabel, formatEventDay, formatEventTime } from "@/components/cards/event-format";
import { eventDetailHref } from "@/lib/navigation/detail-links";
import { groupEventsByDay, isOngoingEvent } from "@/lib/events/events";
import type { EventView } from "@/lib/events/event-views";

// Compact view: one row per event, grouped by the viewer's local day.
export function EventDayList({ events, now }: Readonly<{ events: readonly EventView[]; now: number }>) {
  const { t, locale } = useLocale();
  return (
    <div className="event-days">
      {groupEventsByDay(events).map((group) => (
        <section className="event-day" key={group.day}>
          <h2>{formatEventDay(group.events[0].startsAt, locale)}</h2>
          <ul>
            {group.events.map((event) => {
              const going = event.participants.filter((participant) => participant.status === "going").length;
              return (
                <li key={event.id}>
                  <DetailLink className="event-row" href={eventDetailHref(event.id)} prefetch={false}>
                    <time dateTime={event.startsAt}>{formatEventTime(event.startsAt, locale)}</time>
                    <span className="event-row-type" title={t(`events.type_${event.type}`)}>
                      <EventTypeIcon size={16} type={event.type} />
                      <span className="sr-only">{t(`events.type_${event.type}`)}</span>
                    </span>
                    <span className="event-row-copy">
                      <strong>{event.title}</strong>
                      <small>{eventLocationLabel(event.location, t)}</small>
                    </span>
                    {isOngoingEvent(event, now) && <span className="event-card-ongoing">{t("events.ongoing")}</span>}
                    <span className="event-row-counts">
                      <span>{t("events.going_count", { count: going })}</span>
                      <span>{t("events.maybe_count", { count: event.participants.length - going })}</span>
                    </span>
                    {event.myStatus ? (
                      <span className="event-row-answered" title={t(`events.status_${event.myStatus}`)}>
                        <CheckIcon aria-hidden="true" size={14} />
                        <span className="sr-only">{t(`events.status_${event.myStatus}`)}</span>
                      </span>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </DetailLink>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
