"use client";

import { useState, type SubmitEvent } from "react";
import { AlertIcon, CloseIcon, SendIcon, StationIcon } from "@/components/shared/icons";
import { MessageCard, MessageReplyForm } from "@/components/cards/message-card";
import { DetailLink, DetailSection } from "@/components/shared/detail-page";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { useLocale } from "@/components/providers/locale-provider";
import { eventLocationLabel, formatEventDateTime } from "@/components/cards/event-format";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { eventMessageMaxLength, participationStatuses, type ParticipationStatus } from "@/lib/events/events";
import type { EventMessageView, EventView } from "@/lib/events/event-views";

// Location, own answer, participants and messages of the event detail page.
export function EventDetailBlocks({
  event,
  currentMemberId,
  isStaff,
  past,
  busy,
  onParticipation,
  onSendMessage,
  onDeleteMessage,
}: Readonly<{
  event: EventView;
  currentMemberId: string;
  isStaff: boolean;
  past: boolean;
  busy: boolean;
  onParticipation: (status: ParticipationStatus | null, memberId?: string) => void;
  onSendMessage: (message: string, replyToId?: string) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => void;
}>) {
  const { t, locale } = useLocale();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { location } = event;
  const [replyingTo, setReplyingTo] = useState("");
  const [reply, setReply] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);

  async function send(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    setSending(true);
    if (await onSendMessage(message.trim())) setMessage("");
    setSending(false);
  }

  function startReply(messageId: string) {
    setReplyingTo(messageId);
    setReply("");
    setAcknowledged(false);
  }

  async function sendReply(submitted: SubmitEvent<HTMLFormElement>, entry: EventMessageView) {
    submitted.preventDefault();
    setSending(true);
    if (await onSendMessage(reply.trim(), entry.id)) {
      setReplyingTo("");
      setCollapsed((current) => current.filter((id) => id !== (entry.replyToId ?? entry.id)));
    }
    setSending(false);
  }

  function messageCard(entry: EventMessageView) {
    const replies = event.messages.filter((candidate) => candidate.replyToId === entry.id);
    const isCollapsed = collapsed.includes(entry.id);
    const senderName = entry.senderName || t("pets.former_member");
    return (
      <MessageCard
        body={entry.body}
        createdAt={entry.createdAt}
        deleteLabel={t("events.delete_message")}
        form={
          replyingTo === entry.id && (
            <MessageReplyForm
              acknowledgementLabel="events.messages_notice"
              acknowledged={acknowledged}
              error=""
              onAcknowledgedChange={setAcknowledged}
              onCancel={() => setReplyingTo("")}
              onChange={setReply}
              onSubmit={(submitted) => void sendReply(submitted, entry)}
              rows={3}
              sending={sending}
              subject={senderName}
              value={reply}
            />
          )
        }
        formattedDate={formatEventDateTime(entry.createdAt, locale)}
        key={entry.id}
        onDelete={entry.canDelete ? () => onDeleteMessage(entry.id) : undefined}
        onReply={() => startReply(entry.id)}
        participants={
          <MemberProfileLink
            current={entry.senderMemberId === currentMemberId}
            memberId={entry.senderMemberId}
            name={senderName}
          />
        }
        thread={
          replies.length > 0 && !isCollapsed && <ul className="message-thread-children">{replies.map(messageCard)}</ul>
        }
        toggle={
          replies.length > 0
            ? {
                count: replies.length,
                collapsed: isCollapsed,
                onToggle: () =>
                  setCollapsed((current) =>
                    isCollapsed ? current.filter((id) => id !== entry.id) : [...current, entry.id],
                  ),
              }
            : undefined
        }
      />
    );
  }

  return (
    <>
      <div className="event-detail-pair">
        <DetailSection title="events.location">
          <div className="event-location-block">
            <strong>{eventLocationLabel(location, t)}</strong>
            <span>{galaxyLabel(location.galaxy)}</span>
            <GlyphStrip address={location.portal} large />
            <code>{location.portal}</code>
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
          </div>
        </DetailSection>
        <DetailSection title="events.my_participation">
          {past ? (
            <p className="event-hint">{t("events.past_read_only")}</p>
          ) : (
            <div aria-label={t("events.my_participation")} className="event-answers" role="group">
              {participationStatuses.map((status) => (
                <button
                  aria-pressed={event.myStatus === status}
                  className="event-answer"
                  disabled={busy}
                  key={status}
                  onClick={() => onParticipation(event.myStatus === status ? null : status)}
                  type="button"
                >
                  {t(`events.status_${status}`)}
                </button>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
      <DetailSection title="events.participants">
        {event.participants.length === 0 ? (
          <p className="event-hint">{t("events.no_participants")}</p>
        ) : (
          participationStatuses.map((status) => {
            const members = event.participants.filter((participant) => participant.status === status);
            if (members.length === 0) return null;
            return (
              <div className="event-participants" key={status}>
                <h3>
                  {t(`events.status_${status}`)} ({members.length})
                </h3>
                <ul>
                  {members.map((participant) => (
                    <li key={participant.memberId}>
                      <MemberProfileLink
                        current={participant.memberId === currentMemberId}
                        memberId={participant.memberId}
                        name={participant.name || t("pets.former_member")}
                      />
                      {isStaff && !past && participant.memberId !== currentMemberId && (
                        <button
                          aria-label={t("events.remove_participant_named", { name: participant.name })}
                          disabled={busy}
                          onClick={() => onParticipation(null, participant.memberId)}
                          title={t("events.remove_participant_named", { name: participant.name })}
                          type="button"
                        >
                          <CloseIcon aria-hidden="true" size={12} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </DetailSection>
      <DetailSection title="events.messages">
        {event.messages.length === 0 && <p className="event-hint">{t("events.no_messages")}</p>}
        <ul className="event-messages">{event.messages.filter((entry) => !entry.replyToId).map(messageCard)}</ul>
        <form className="event-message-form" onSubmit={(submitted) => void send(submitted)}>
          <label className="field">
            <span>{t("events.new_message")}</span>
            <textarea
              maxLength={eventMessageMaxLength}
              onChange={(change) => setMessage(change.target.value)}
              required
              rows={3}
              value={message}
            />
          </label>
          <p className="event-hint">
            <AlertIcon aria-hidden="true" size={13} />
            {t("events.messages_notice")}
          </p>
          <button className="primary-button" disabled={sending || !message.trim()} type="submit">
            <SendIcon aria-hidden="true" size={15} />
            {t("events.send_message")}
          </button>
        </form>
      </DetailSection>
    </>
  );
}
