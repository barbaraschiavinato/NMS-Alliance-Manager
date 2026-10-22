"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { DetailLink as Link, useDetailReturn } from "@/components/shared/detail-page";
import { Archive, ArchiveRestore, Crosshair, Eclipse, Orbit } from "lucide-react";

import { MessageCard, MessageReplyForm } from "@/components/cards/message-card";
import { MessageList } from "@/components/sections/message-list";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { Tabs } from "@/components/layout/tabs";
import { TaxiRequestDialog } from "@/components/modals/taxi-request-dialog";
import type { MeetingStation, TaxiStationOption, BroadcastKind, TaxiMeetingPoint } from "@/lib/private-messages-store";
import { AdminPanel } from "@/components/modals/admin-panel";
import { PlanetCard } from "@/components/modals/planet-card";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { galaxyLabel } from "@/lib/galaxies";
import { portalSearchMatches } from "@/lib/missions";
import { isSameSystem, missionDetailHref, stationDetailHref, type SystemIdentity } from "@/lib/detail-links";
import { DetailBackLink, DetailSection } from "@/components/shared/detail-page";
import { useRouter } from "next/navigation";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { useLocale } from "@/components/providers/locale-provider";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";

type HelpReply = Readonly<{
  id: string;
  senderMemberId?: string;
  body: string;
  senderName: string;
  createdAt: string;
}>;

type HelpRequest = Readonly<{
  id: string;
  senderMemberId?: string;
  subject?: string;
  body: string;
  portal?: string;
  galaxy?: number;
  missionCode?: string;
  meetingStation?: MeetingStation;
  meetingPoint?: TaxiMeetingPoint;
  senderName: string;
  createdAt: string;
  replies: HelpReply[];
  archived?: boolean;
}>;

async function fetchHelpRequests(signal: AbortSignal, kind: BroadcastKind): Promise<HelpRequest[]> {
  const response = await fetch(`/api/${kind === "taxi" ? "taxi-requests" : "help-requests"}`, {
    cache: "no-store",
    signal,
  });
  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body)) {
    const message = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof message === "string" ? message : `${kind}.error_unable_to_read`);
  }
  return body as HelpRequest[];
}

export function HelpRequestsPage({
  currentMember,
  alliance,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
  kind = "help",
  taxiStations = [],
  systemScope,
  detailRootId,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
  kind?: BroadcastKind;
  taxiStations?: readonly TaxiStationOption[];
  systemScope?: SystemIdentity;
  detailRootId?: string;
}>) {
  const router = useRouter();
  const returnDestination = useDetailReturn(kind === "taxi" ? "/taxi" : "/help-requests");
  const { t, locale } = useLocale();
  const endpoint = `/api/${kind === "taxi" ? "taxi-requests" : "help-requests"}`;
  const requestKey = (suffix: string) => `${kind}.${suffix}`;
  const [taxiOpen, setTaxiOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replyAcknowledged, setReplyAcknowledged] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [expandedArchiveIds, setExpandedArchiveIds] = useState<Set<string>>(new Set());
  const [openRequest, setOpenRequest] = useState<HelpRequest | null>(null);

  async function sendReply(event: SubmitEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    setReplySending(true);
    setReplyError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyBody, replyToId: requestId }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key = result && typeof result === "object" && "error" in result ? result.error : null;
        throw new Error(typeof key === "string" ? key : `${kind}.request_unable_to_save`);
      }
      setRequests(await fetchHelpRequests(new AbortController().signal, kind));
      setReplyingTo("");
      setReplyBody("");
    } catch (error_: unknown) {
      setReplyError(error_ instanceof Error ? error_.message : `${kind}.request_unable_to_save`);
    } finally {
      setReplySending(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchHelpRequests(controller.signal, kind)
      .then(setRequests)
      .catch((error_: unknown) => {
        if (!controller.signal.aborted)
          setError(error_ instanceof Error ? error_.message : `${kind}.error_unable_to_read`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, revision]);

  async function deleteRequest(id: string, isReply: boolean) {
    if (!window.confirm(t(requestKey(isReply ? "confirm_delete_reply" : "confirm_delete_request")))) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key = result && typeof result === "object" && "error" in result ? result.error : null;
        throw new Error(typeof key === "string" ? key : `${kind}.request_unable_to_delete`);
      }
      setRequests((current) =>
        current
          .filter((entry) => entry.id !== id)
          .map((entry) => ({ ...entry, replies: entry.replies.filter((reply) => reply.id !== id) })),
      );
      window.dispatchEvent(new Event(`${kind}-requests-changed`));
      if (id === detailRootId) router.replace(returnDestination);
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : `${kind}.request_unable_to_delete`);
    } finally {
      setDeletingId("");
    }
  }

  async function archiveRequest(request: HelpRequest) {
    setArchivingId(request.id);
    setError("");
    try {
      const archived = !request.archived;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, archived }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key = result && typeof result === "object" && "error" in result ? result.error : null;
        throw new Error(typeof key === "string" ? key : "broadcast.archive_failed");
      }
      setRequests((current) => current.map((entry) => (entry.id === request.id ? { ...entry, archived } : entry)));
      setExpandedArchiveIds((current) => {
        const next = new Set(current);
        next.delete(request.id);
        return next;
      });
      if (replyingTo === request.id) setReplyingTo("");
      window.dispatchEvent(new Event(`${kind}-requests-changed`));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "broadcast.archive_failed");
    } finally {
      setArchivingId("");
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }

  const scopedRequests = systemScope
    ? requests.filter(
        (request) =>
          request.portal !== undefined &&
          request.galaxy !== undefined &&
          isSameSystem({ portal: request.portal, galaxy: request.galaxy }, systemScope),
      )
    : requests;
  const visibleRequests = detailRootId
    ? scopedRequests.filter((request) => request.id === detailRootId)
    : scopedRequests.filter((request) => Boolean(request.archived) === (tab === "archived"));
  const Content = systemScope ? "div" : "main";

  return (
    <DetailSection title={systemScope && (scopedRequests.length > 0 || error) ? "help.help_requests" : undefined}>
      <div
        className={
          systemScope ? undefined : `app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`
        }
      >
        {!systemScope && (
          <>
            <Sidebar
              activeSection={kind === "taxi" ? "taxi" : "aiuto"}
              currentMember={member}
              missionCount={missionCount}
              settings={settings}
              stationCount={stationCount}
              offlineCount={offlineCount}
              userCount={userCount}
            />
          </>
        )}
        <section className={systemScope ? undefined : "main-panel"}>
          {!systemScope && (
            <>
              <Header
                currentMember={member}
                onAdminOpen={() => setAdminOpen(true)}
                onProfileOpen={() => setProfileOpen(true)}
                onProfileSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
                sectionTitle={kind === "taxi" ? "taxi.title" : "help.help_requests"}
                settings={settings}
              />
              {!detailRootId && (
                <Hero
                  settings={settings}
                  subtitle={t(requestKey("page_description"))}
                  title={kind === "taxi" ? "taxi.title" : "help.help_requests"}
                >
                  {kind === "taxi" && (
                    <HeroAddButton
                      label="taxi.new_request"
                      onClick={() => {
                        if (isValidNmsFriendCode(member.nmsCode)) setTaxiOpen(true);
                        else setProfileOpen(true);
                      }}
                    />
                  )}
                </Hero>
              )}
            </>
          )}
          {(!systemScope || scopedRequests.length > 0 || error) && (
            <Content className={systemScope ? "messages-page" : "content-wrap messages-page"}>
              {detailRootId && (
                <DetailBackLink
                  href={kind === "taxi" ? "/taxi" : "/help-requests"}
                  label={kind === "taxi" ? "details.back_to_taxi" : "details.back_to_help"}
                />
              )}
              {!detailRootId && kind === "taxi" && !isValidNmsFriendCode(member.nmsCode) && (
                <p className="taxi-profile-notice">{t("taxi.friend_code_required")}</p>
              )}
              {!detailRootId && (
                <div className="sticky-list-controls">
                  <Tabs
                    className="member-filter-tabs"
                    label={t(kind === "taxi" ? "taxi.title" : "help.help_requests")}
                    items={(
                      [
                        ["active", "broadcast.active"],
                        ["archived", "broadcast.archived"],
                      ] as const
                    ).map(([key, label]) => ({
                      key,
                      label: t(label),
                      count: scopedRequests.filter((request) => Boolean(request.archived) === (key === "archived"))
                        .length,
                      selected: tab === key,
                      onSelect: () => {
                        setTab(key);
                        setReplyingTo("");
                        setExpandedArchiveIds(new Set());
                      },
                    }))}
                  />
                </div>
              )}
              <MessageList
                empty={visibleRequests.length === 0}
                emptyLabel={t(tab === "archived" ? "broadcast.no_archived_requests" : requestKey("no_requests"))}
                error={error}
                loading={loading}
              >
                {visibleRequests.map((request) => {
                  const meetingStation = request.meetingStation;
                  const hubStation =
                    kind === "taxi" && request.meetingPoint === "hub" && meetingStation
                      ? taxiStations.find(
                          (station) =>
                            station.galaxy === meetingStation.galaxy &&
                            portalSearchMatches(station.portal, meetingStation.portal),
                        )
                      : undefined;
                  const linkedStation =
                    hubStation ??
                    (kind === "taxi" && request.meetingPoint !== "hub" && meetingStation
                      ? taxiStations.find(
                          (station) =>
                            station.galaxy === meetingStation.galaxy &&
                            portalSearchMatches(station.portal, meetingStation.portal),
                        )
                      : undefined);
                  return (
                    <MessageCard
                      body={request.body}
                      createdAt={request.createdAt}
                      deleteLabel={t(requestKey("delete_request"))}
                      deleting={deletingId === request.id}
                      disclosure={
                        request.archived && !detailRootId
                          ? {
                              collapsed: !expandedArchiveIds.has(request.id),
                              onToggle: () =>
                                setExpandedArchiveIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(request.id)) next.delete(request.id);
                                  else next.add(request.id);
                                  return next;
                                }),
                            }
                          : undefined
                      }
                      form={
                        !request.archived && replyingTo === request.id ? (
                          <MessageReplyForm
                            acknowledgementLabel={kind === "taxi" ? "taxi.message_notice" : undefined}
                            acknowledged={replyAcknowledged}
                            error={replyError}
                            onAcknowledgedChange={setReplyAcknowledged}
                            onCancel={() => setReplyingTo("")}
                            onChange={setReplyBody}
                            onSubmit={(event) => void sendReply(event, request.id)}
                            rows={3}
                            sending={replySending}
                            subject={request.subject || t("messages.no_subject")}
                            value={replyBody}
                          />
                        ) : undefined
                      }
                      formattedDate={formatDate(request.createdAt)}
                      toolsAfterDate={
                        request.senderMemberId === member.publicId ||
                        member.role === "admin" ||
                        member.role === "moderator" ? (
                          <button
                            aria-label={t(request.archived ? "broadcast.restore" : "broadcast.archive")}
                            className="member-icon-action"
                            data-tooltip={t(request.archived ? "broadcast.restore" : "broadcast.archive")}
                            disabled={archivingId === request.id}
                            onClick={() => void archiveRequest(request)}
                            type="button"
                          >
                            {request.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        ) : undefined
                      }
                      key={request.id}
                      onDelete={
                        request.senderMemberId === member.publicId ||
                        member.role === "admin" ||
                        member.role === "moderator"
                          ? () => void deleteRequest(request.id, false)
                          : undefined
                      }
                      onReply={
                        !request.archived && replyingTo !== request.id
                          ? () => {
                              setReplyError("");
                              setReplyBody("");
                              setReplyAcknowledged(false);
                              setReplyingTo(request.id);
                            }
                          : undefined
                      }
                      participants={
                        <>
                          {t("messages.from")}{" "}
                          <MemberProfileLink memberId={request.senderMemberId} name={request.senderName} />
                        </>
                      }
                      replies={
                        request.replies.length > 0 ? (
                          <ul className="message-thread-children">
                            {request.replies.map((reply) => (
                              <MessageCard
                                body={reply.body}
                                createdAt={reply.createdAt}
                                deleteLabel={t(requestKey("delete_request"))}
                                deleting={deletingId === reply.id}
                                formattedDate={formatDate(reply.createdAt)}
                                key={reply.id}
                                onDelete={
                                  reply.senderMemberId === member.publicId ||
                                  member.role === "admin" ||
                                  member.role === "moderator"
                                    ? () => void deleteRequest(reply.id, true)
                                    : undefined
                                }
                                participants={
                                  <>
                                    {t("messages.from")}{" "}
                                    <MemberProfileLink
                                      memberId={reply.senderMemberId}
                                      name={reply.senderName}
                                      current={reply.senderMemberId === member.publicId}
                                    />
                                  </>
                                }
                              />
                            ))}
                          </ul>
                        ) : undefined
                      }
                      titleDetails={
                        <>
                          {kind === "taxi" && !request.meetingStation && (
                            <span>
                              {t("taxi.meeting_point_label", {
                                point: t(
                                  request.meetingPoint === "offline" ? "taxi.offline" : "taxi.no_meeting_station",
                                ),
                              })}
                            </span>
                          )}
                          {kind === "taxi" && request.meetingStation && !linkedStation && (
                            <span>
                              {t("taxi.meeting_at", {
                                station:
                                  request.meetingPoint === "hub"
                                    ? `${t("taxi.alliance_hub")} · ${request.meetingStation.portal}`
                                    : request.meetingStation.name || request.meetingStation.portal,
                                galaxy: galaxyLabel(request.meetingStation.galaxy),
                              })}
                            </span>
                          )}
                          {kind === "taxi" && linkedStation && request.meetingStation && (
                            <Link
                              className="message-meeting-station"
                              href={stationDetailHref(linkedStation.id, "taxi")}
                              aria-label={t("taxi.open_meeting_station")}
                              data-tooltip={t("taxi.open_meeting_station")}
                            >
                              <Orbit size={15} />
                              {t("taxi.meeting_at", {
                                station:
                                  request.meetingPoint === "hub"
                                    ? t("taxi.alliance_hub")
                                    : request.meetingStation.name || request.meetingStation.portal,
                                galaxy: galaxyLabel(request.meetingStation.galaxy),
                              })}
                            </Link>
                          )}
                        </>
                      }
                      subjectActions={
                        <>
                          {request.missionCode && (
                            <Link
                              aria-label={t("messages.open_mission")}
                              className="member-icon-action message-subject-link member-link-action"
                              href={missionDetailHref(request.missionCode, systemScope ? "stations" : kind)}
                              title={t("messages.open_mission")}
                            >
                              <Crosshair size={15} />
                            </Link>
                          )}
                          {kind === "help" && request.portal && request.galaxy !== undefined && (
                            <button
                              aria-label={t("planet.open_planet_details")}
                              className="member-icon-action message-subject-link member-planet-action"
                              onClick={() => setOpenRequest(request)}
                              title={t("planet.open_planet_details")}
                              type="button"
                            >
                              <Eclipse size={15} />
                            </button>
                          )}
                        </>
                      }
                      title={
                        kind === "taxi" && request.galaxy !== undefined
                          ? t("taxi.destination", { galaxy: galaxyLabel(request.galaxy) })
                          : request.subject || t("messages.no_subject")
                      }
                    />
                  );
                })}
              </MessageList>
            </Content>
          )}
        </section>
        {taxiOpen && (
          <TaxiRequestDialog
            alliance={settings}
            stations={taxiStations}
            onClose={() => setTaxiOpen(false)}
            onSaved={() => {
              setTaxiOpen(false);
              setError("");
              setRevision((current) => current + 1);
              window.dispatchEvent(new Event("taxi-requests-changed"));
            }}
          />
        )}
        {openRequest?.portal && openRequest.galaxy !== undefined && (
          <PlanetCard
            contextLabel={galaxyLabel(openRequest.galaxy)}
            galaxy={openRequest.galaxy}
            key={`${openRequest.portal}:${openRequest.galaxy}`}
            onClose={() => setOpenRequest(null)}
            portal={openRequest.portal}
            title={openRequest.subject || t("planet.fallback_name")}
          />
        )}
        {adminOpen && member.role === "admin" && (
          <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />
        )}
        {profileOpen && (
          <MemberProfilePanel
            member={member}
            onClose={() => setProfileOpen(false)}
            onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
          />
        )}
      </div>
    </DetailSection>
  );
}
