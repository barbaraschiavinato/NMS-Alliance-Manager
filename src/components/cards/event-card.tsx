"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DeleteIcon, DuplicateIcon, EditIcon, EventLocationIcon, StationIcon } from "@/components/shared/icons";
import { DetailLink } from "@/components/shared/detail-page";
import { EventTypeIcon } from "@/components/shared/event-type-icon";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { PetImageDialog } from "@/components/modals/pet-image-dialog";
import { useLocale } from "@/components/providers/locale-provider";
import { eventLocationLabel, formatEventPeriod } from "@/components/cards/event-format";
import { eventDetailHref } from "@/lib/navigation/detail-links";
import { isOngoingEvent } from "@/lib/events/events";
import type { EventView } from "@/lib/events/event-views";

export function EventCard({
  event,
  currentMemberId,
  now,
  full = false,
  onEdit,
  onDuplicate,
  onRemove,
}: Readonly<{
  event: EventView;
  currentMemberId: string;
  now: number;
  // The detail page card: no link to itself and a larger image.
  full?: boolean;
  onEdit: (event: EventView) => void;
  onDuplicate: (event: EventView) => void;
  onRemove: (event: EventView) => void;
}>) {
  const { t, locale } = useLocale();
  const [imageOpen, setImageOpen] = useState(false);
  const going = event.participants.filter((participant) => participant.status === "going").length;

  return (
    <li className={full ? "event-card event-card-full" : "event-card"}>
      <div className="event-card-heading">
        <span className="event-card-type">
          <EventTypeIcon type={event.type} />
          {t(`events.type_${event.type}`)}
        </span>
        {isOngoingEvent(event, now) && <span className="event-card-ongoing">{t("events.ongoing")}</span>}
        <span className="event-card-creator">
          <small>{t("events.organizer")}</small>
          <MemberProfileLink
            current={event.creatorId === currentMemberId}
            memberId={event.creatorMemberId}
            name={event.creatorName || t("pets.former_member")}
          />
        </span>
      </div>
      {full ? (
        <strong className="event-card-title">{event.title}</strong>
      ) : (
        <DetailLink className="event-card-title" href={eventDetailHref(event.id)} prefetch={false}>
          {event.title}
        </DetailLink>
      )}
      <time className="event-card-period" dateTime={event.startsAt}>
        {formatEventPeriod(event.startsAt, event.endsAt, locale)}
      </time>
      <p className="event-card-location">
        <EventLocationIcon aria-hidden="true" size={13} />
        {eventLocationLabel(event.location, t)}
      </p>
      {event.imageUrl && (
        <button
          aria-label={t("pets.enlarge_image", { name: event.title })}
          className="event-card-image-button"
          onClick={() => setImageOpen(true)}
          title={t("pets.enlarge_image", { name: event.title })}
          type="button"
        >
          <Image alt="" className="event-card-image" height={360} src={event.imageUrl} unoptimized width={640} />
        </button>
      )}
      <p className="event-card-description">{event.description}</p>
      <div className="station-card-footer event-card-footer">
        <span className="event-card-counts">
          {t("events.going_count", { count: going })} ·{" "}
          {t("events.maybe_count", { count: event.participants.length - going })}
        </span>
        <div className="station-actions">
          {event.stationHref && (
            <DetailLink
              aria-label={t("missions.open_linked_station")}
              className="member-icon-action member-station-filter"
              data-tooltip={t("missions.open_linked_station")}
              href={event.stationHref}
              prefetch={false}
            >
              <StationIcon aria-hidden="true" size={14} />
            </DetailLink>
          )}
          <button
            aria-label={t("events.duplicate_named", { event: event.title })}
            className="member-icon-action"
            data-tooltip={t("events.duplicate")}
            onClick={() => onDuplicate(event)}
            type="button"
          >
            <DuplicateIcon size={14} />
          </button>
          {event.canManage && (
            <>
              <button
                aria-label={t("events.edit_named", { event: event.title })}
                className="member-icon-action"
                data-tooltip={t("events.edit_event")}
                onClick={() => onEdit(event)}
                type="button"
              >
                <EditIcon size={14} />
              </button>
              <button
                aria-label={t("events.delete_named", { event: event.title })}
                className="member-icon-action delete-member"
                data-tooltip={t("events.delete_event")}
                onClick={() => onRemove(event)}
                type="button"
              >
                <DeleteIcon size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      {imageOpen &&
        event.imageUrl &&
        createPortal(
          <PetImageDialog imageUrl={event.imageUrl} name={event.title} onClose={() => setImageOpen(false)} />,
          document.body,
        )}
    </li>
  );
}
