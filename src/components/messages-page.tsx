"use client";

import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, CircleAlert, Compass, Crosshair, Reply, Send } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { LoadingSpinner } from "@/components/loading-spinner";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/locale-provider";

type MessageEntry = Readonly<{
  id: string;
  senderEmail: string;
  recipientEmail: string;
  senderName: string;
  recipientName: string;
  body: string;
  subject?: string;
  subjectType?: "planet" | "mission";
  threadId?: string;
  replyToId?: string;
  portal?: string;
  galaxy?: number;
  planetNumber?: number;
  missionCode?: string;
  createdAt: string;
}>;

type MessageNode = {
  message: MessageEntry;
  children: MessageNode[];
};

function buildMessageTree(messages: MessageEntry[]): MessageNode[] {
  const nodes = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];

  for (const message of messages) nodes.set(message.id, { message, children: [] });
  for (const node of nodes.values()) {
    const parent = node.message.replyToId ? nodes.get(node.message.replyToId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

async function fetchMessages(signal?: AbortSignal): Promise<MessageEntry[]> {
  const response = await fetch("/api/messages", { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body)) {
    const message = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof message === "string" ? message : "messages.error_unable_to_read");
  }
  return body as MessageEntry[];
}

export function MessagesPage({ currentMember, alliance, missionCount, stationCount, userCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  userCount?: number;
}>) {
  const { t, locale } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [collapsedMessageIds, setCollapsedMessageIds] = useState<Set<string>>(() => new Set());
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMessages(controller.signal)
      .then(setMessages)
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) {
          setError(error_ instanceof Error ? error_.message : "messages.error_unable_to_read");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function sendReply(event: SubmitEvent<HTMLFormElement>, originalMessage: MessageEntry) {
    event.preventDefault();
    setSendingReply(true);
    setReplyError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyToId: originalMessage.id, message: replyBody }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const errorKey = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof errorKey === "string" ? errorKey : "messages.error_unable_to_send_reply");
      }
      setMessages(await fetchMessages());
      setReplyBody("");
      setReplyingTo(null);
    } catch (error_: unknown) {
      setReplyError(error_ instanceof Error ? error_.message : "messages.error_unable_to_send_reply");
    } finally {
      setSendingReply(false);
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

  const isModerator = member.role === "admin" || member.role === "moderator";
  const messageTree = buildMessageTree(messages);
  const expandableMessageIds: string[] = [];
  function collectExpandableMessageIds(nodes: MessageNode[]) {
    for (const node of nodes) {
      if (node.children.length > 0) expandableMessageIds.push(node.message.id);
      collectExpandableMessageIds(node.children);
    }
  }
  collectExpandableMessageIds(messageTree);

  function renderMessage(node: MessageNode): ReactNode {
    const { message } = node;
    const sentByCurrentMember = message.senderEmail.toLowerCase() === member.email.toLowerCase();
    const canReply = sentByCurrentMember || message.recipientEmail.toLowerCase() === member.email.toLowerCase();
    const isCollapsed = collapsedMessageIds.has(message.id);
    const isReply = Boolean(message.replyToId);
    return <li className="message-tree-node" key={message.id}>
      <article className="message-card">
        <div className="message-card-heading">
          <div className="message-card-main-heading">
            {!isReply && <h2>{message.subject || t("messages.no_subject")}</h2>}
            <p className="message-participants">
              {isModerator
                ? <>{t("messages.from")} <strong>{message.senderName}</strong> · {t("messages.to")} <strong>{message.recipientName}</strong></>
                : sentByCurrentMember
                  ? <>{t("messages.to")} <strong>{message.recipientName}</strong></>
                  : <>{t("messages.from")} <strong>{message.senderName}</strong></>}
            </p>
          </div>
          <div className="message-card-tools">
            <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
            {!isReply && message.subjectType === "mission" && message.missionCode && <Link
              aria-label={t("messages.open_mission")}
              className="member-icon-action message-subject-link"
              data-tooltip={t("messages.open_mission")}
              href={`/?search=${encodeURIComponent(message.missionCode)}`}
              title={t("messages.open_mission")}
            ><Crosshair size={15} /></Link>}
            {!isReply && message.subjectType === "planet" && message.portal && <Link
              aria-label={t("messages.open_planet_station")}
              className="member-icon-action message-subject-link"
              data-tooltip={t("messages.open_planet_station")}
              href={`/stations?search=${encodeURIComponent(message.portal)}`}
              title={t("messages.open_planet_station")}
            ><Compass size={15} /></Link>}
          </div>
        </div>
        <p className="message-body">{message.body}</p>
        <div className="message-card-actions">
          {node.children.length > 0 && <button
            aria-expanded={!isCollapsed}
            className="quiet-button message-thread-toggle"
            onClick={() => setCollapsedMessageIds((current) => {
              const next = new Set(current);
              if (next.has(message.id)) next.delete(message.id);
              else next.add(message.id);
              return next;
            })}
            type="button"
          >{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{t(isCollapsed ? "messages.show_replies" : "messages.hide_replies", { count: node.children.length })}</button>}
          {canReply && replyingTo !== message.id && <button className="quiet-button message-reply-button" onClick={() => {
            setReplyError("");
            setReplyBody("");
            setReplyingTo(message.id);
          }} type="button"><Reply size={14} />{t("messages.reply")}</button>}
        </div>
        {canReply && replyingTo === message.id && <form className="message-reply-form" onSubmit={(event) => void sendReply(event, message)}>
          <label className="field">
            <span>{t("messages.reply_to", { subject: message.subject || t("messages.no_subject") })}</span>
            <textarea autoFocus maxLength={2000} onChange={(event) => setReplyBody(event.target.value)} required rows={4} value={replyBody} />
          </label>
          {replyError && <p className="form-error"><CircleAlert size={15} />{t(replyError)}</p>}
          <div className="message-reply-actions">
            <button className="quiet-button" onClick={() => {
              setReplyingTo(null);
              setReplyError("");
            }} type="button">{t("common.cancel")}</button>
            <button className="primary-button" disabled={sendingReply || !replyBody.trim()} type="submit">{sendingReply ? t("common.saving") : t("messages.send_reply")}<Send size={14} /></button>
          </div>
        </form>}
      </article>
      {node.children.length > 0 && !isCollapsed && <ul className="message-thread-children">{node.children.map(renderMessage)}</ul>}
    </li>;
  }

  return <div className="app-shell">
    <AllianceSidebar activeSection="messaggi" currentMember={member} missionCount={missionCount} settings={settings} stationCount={stationCount} userCount={userCount} />
    <section className="main-panel">
      <DashboardTopbar currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="messages.messages" settings={settings} />
      <MissionHero description={t("messages.page_description")} settings={settings} title="messages.messages" />
      <main className="content-wrap messages-page">
        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {loading
          ? <div className="messages-loading"><LoadingSpinner /></div>
          : messages.length === 0
            ? <p className="messages-empty">{t("messages.no_messages")}</p>
            : <>
              {expandableMessageIds.length > 0 && <div className="message-thread-controls">
                <button className="quiet-button" onClick={() => setCollapsedMessageIds(new Set())} type="button"><ChevronsDown size={14} />{t("messages.expand_all_replies")}</button>
                <button className="quiet-button" onClick={() => setCollapsedMessageIds(new Set(expandableMessageIds))} type="button"><ChevronsUp size={14} />{t("messages.collapse_all_replies")}</button>
              </div>}
              <ul className="messages-list">{messageTree.map(renderMessage)}</ul>
            </>}
      </main>
    </section>
    {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
    {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
  </div>;
}
