"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { CircleAlert, Crosshair, Eclipse, Reply, Send, Trash2, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { PlanetCard } from "@/components/modals/planet-card";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { galaxyLabel } from "@/lib/galaxies";
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
  senderName: string;
  createdAt: string;
  replies: HelpReply[];
}>;

async function fetchHelpRequests(signal: AbortSignal): Promise<HelpRequest[]> {
  const response = await fetch("/api/help-requests", { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body)) {
    const message = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof message === "string" ? message : "help.error_unable_to_read");
  }
  return body as HelpRequest[];
}

export function HelpRequestsPage({ currentMember, alliance, missionCount, stationCount, userCount, offlineCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
}>) {
  const { t, locale } = useLocale();
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
  const [openRequest, setOpenRequest] = useState<HelpRequest | null>(null);

  async function sendReply(event: SubmitEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    setReplySending(true);
    setReplyError("");
    try {
      const response = await fetch("/api/help-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyBody, replyToId: requestId }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key = result && typeof result === "object" && "error" in result ? result.error : null;
        throw new Error(typeof key === "string" ? key : "help.request_unable_to_save");
      }
      setRequests(await fetchHelpRequests(new AbortController().signal));
      setReplyingTo("");
      setReplyBody("");
    } catch (error_: unknown) {
      setReplyError(error_ instanceof Error ? error_.message : "help.request_unable_to_save");
    } finally {
      setReplySending(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchHelpRequests(controller.signal)
      .then(setRequests)
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : "help.error_unable_to_read");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function deleteRequest(id: string, isReply: boolean) {
    if (!window.confirm(t(isReply ? "help.confirm_delete_reply" : "help.confirm_delete_request"))) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch("/api/help-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key = result && typeof result === "object" && "error" in result ? result.error : null;
        throw new Error(typeof key === "string" ? key : "help.request_unable_to_delete");
      }
      setRequests((current) => current
        .filter((entry) => entry.id !== id)
        .map((entry) => ({ ...entry, replies: entry.replies.filter((reply) => reply.id !== id) })));
      window.dispatchEvent(new Event("help-requests-changed"));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "help.request_unable_to_delete");
    } finally {
      setDeletingId("");
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  return <div className="app-shell">
    <Sidebar activeSection="aiuto" currentMember={member} missionCount={missionCount} settings={settings} stationCount={stationCount} offlineCount={offlineCount} userCount={userCount} />
    <section className="main-panel">
      <Header currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="help.help_requests" settings={settings} />
      <Hero settings={settings} subtitle={t("help.page_description")} title="help.help_requests" />
      <main className="content-wrap messages-page">
        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {loading && <div className="messages-loading"><LoadingSpinner /></div>}
        {!loading && !error && requests.length === 0 && <p className="messages-empty">{t("help.no_requests")}</p>}
        <ul className="messages-list">
          {requests.map((request) => <li className="message-tree-node" key={request.id}>
            <article className="message-card">
              <div className="message-card-heading">
                <div className="message-card-main-heading">
                  <div className="message-card-subject">
                    {request.missionCode && <Link
                      aria-label={t("messages.open_mission")}
                      className="member-icon-action message-subject-link member-link-action"
                      href={`/missions?search=${encodeURIComponent(request.missionCode)}`}
                      title={t("messages.open_mission")}
                    ><Crosshair size={15} /></Link>}
                    {request.portal && request.galaxy !== undefined && <button
                      aria-label={t("planet.open_planet_details")}
                      className="member-icon-action message-subject-link member-planet-action"
                      onClick={() => setOpenRequest(request)}
                      title={t("planet.open_planet_details")}
                      type="button"
                    ><Eclipse size={15} /></button>}
                    <h2>{request.subject || t("messages.no_subject")}</h2>
                  </div>
                  <p className="message-participants">{t("messages.from")} <strong>{request.senderName}</strong></p>
                </div>
                <div className="message-card-tools">
                  <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
                  {(request.senderMemberId === member.publicId || member.role === "admin" || member.role === "moderator") && <button
                    aria-label={t("help.delete_request")}
                    className="member-icon-action delete-member"
                    disabled={deletingId === request.id}
                    onClick={() => void deleteRequest(request.id, false)}
                    title={t("help.delete_request")}
                    type="button"
                  ><Trash2 size={14} /></button>}
                </div>
              </div>
              <p className="message-body">{request.body}</p>
              {request.replies.length > 0 && <ul className="message-thread-children">
                {request.replies.map((reply) => <li className="message-tree-node" key={reply.id}>
                  <article className="message-card">
                    <div className="message-card-heading">
                      <div className="message-card-main-heading">
                        <p className="message-participants">{t("messages.from")} <strong className={reply.senderMemberId === member.publicId ? "current-member" : undefined}>{reply.senderName}</strong></p>
                      </div>
                      <div className="message-card-tools">
                        <time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time>
                        {(reply.senderMemberId === member.publicId || member.role === "admin" || member.role === "moderator") && <button
                          aria-label={t("help.delete_request")}
                          className="member-icon-action delete-member"
                          disabled={deletingId === reply.id}
                          onClick={() => void deleteRequest(reply.id, true)}
                          title={t("help.delete_request")}
                          type="button"
                        ><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <p className="message-body">{reply.body}</p>
                  </article>
                </li>)}
              </ul>}
              <div className="message-card-actions">
                {replyingTo !== request.id && <button
                  aria-label={t("messages.reply")}
                  className="member-icon-action message-reply-button"
                  onClick={() => {
                    setReplyError("");
                    setReplyBody("");
                    setReplyAcknowledged(false);
                    setReplyingTo(request.id);
                  }}
                  title={t("messages.reply")}
                  type="button"
                ><Reply size={14} /></button>}
              </div>
              {replyingTo === request.id && <form className="message-reply-form" onSubmit={(event) => void sendReply(event, request.id)}>
                <label className="field">
                  <span>{t("messages.reply_to", { subject: request.subject || t("messages.no_subject") })}</span>
                  <textarea autoFocus maxLength={2000} onChange={(event) => setReplyBody(event.target.value)} required rows={3} value={replyBody} />
                </label>
                <label className="message-acknowledgement">
                  <input checked={replyAcknowledged} onChange={(event) => setReplyAcknowledged(event.target.checked)} required type="checkbox" />
                  <span>{t("profile.message_mission_only_notice")}</span>
                </label>
                {replyError && <p className="form-error"><CircleAlert size={15} />{t(replyError)}</p>}
                <div className="message-reply-actions">
                  <button aria-label={t("common.cancel")} className="member-icon-action delete-member" onClick={() => setReplyingTo("")} title={t("common.cancel")} type="button"><X size={14} /></button>
                  <button aria-label={t("messages.send_reply")} className="member-icon-action reply-submit" disabled={replySending || !replyBody.trim() || !replyAcknowledged} title={t("messages.send_reply")} type="submit"><Send size={14} /></button>
                </div>
              </form>}
            </article>
          </li>)}
        </ul>
      </main>
    </section>
    {openRequest?.portal && openRequest.galaxy !== undefined && <PlanetCard
      contextLabel={galaxyLabel(openRequest.galaxy)}
      galaxy={openRequest.galaxy}
      key={`${openRequest.portal}:${openRequest.galaxy}`}
      onClose={() => setOpenRequest(null)}
      portal={openRequest.portal}
      title={openRequest.subject || t("planet.fallback_name")}
    />}
    {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
    {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
  </div>;
}
