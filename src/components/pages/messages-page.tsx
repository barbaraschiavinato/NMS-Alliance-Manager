"use client";

import { Tabs } from "@/components/layout/tabs";
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, CircleAlert, Crosshair, MailCheck, Orbit, Reply, Send, Trash2, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/providers/locale-provider";

type MessageEntry = Readonly<{
  id: string;
  senderMemberId?: string;
  recipientMemberId?: string;
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
  unread?: boolean;
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

type MessageScope = "mine" | "all";
type MessageTab = "received" | "sent" | "all";

async function fetchMessages(scope: MessageScope, signal?: AbortSignal): Promise<MessageEntry[]> {
  const response = await fetch(scope === "all" ? "/api/messages?scope=all" : "/api/messages", { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body)) {
    const message = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof message === "string" ? message : "messages.error_unable_to_read");
  }
  return body as MessageEntry[];
}

export function MessagesPage({ currentMember, alliance, missionCount, stationCount, userCount, offlineCount }: Readonly<{
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
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [tab, setTab] = useState<MessageTab>("received");
  const fetchScope: MessageScope = currentMember.role === "admin" ? "all" : "mine";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyAcknowledged, setReplyAcknowledged] = useState(false);
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<string>>(() => new Set());
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMessages(fetchScope, controller.signal)
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
  }, [fetchScope]);

  async function markRead(ids: string[]) {
    const idSet = new Set(ids.filter((id) => messages.some((entry) => entry.id === id && entry.unread && entry.recipientMemberId === member.publicId)));
    if (idSet.size === 0) return;
    setMessages((current) => current.map((entry) => idSet.has(entry.id) ? { ...entry, unread: false } : entry));
    try {
      await fetch("/api/messages", {
        body: JSON.stringify({ messageIds: [...idSet] }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
    } finally {
      window.dispatchEvent(new Event("messages-unread-changed"));
    }
  }

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
      setMessages(await fetchMessages(fetchScope));
      setReplyBody("");
      setReplyAcknowledged(false);
      setReplyingTo(null);
    } catch (error_: unknown) {
      setReplyError(error_ instanceof Error ? error_.message : "messages.error_unable_to_send_reply");
    } finally {
      setSendingReply(false);
    }
  }

  async function deleteMessage(message: MessageEntry) {
    if (!window.confirm(t("messages.confirm_delete"))) return;
    setError("");
    setDeletingMessageIds((current) => new Set(current).add(message.id));
    try {
      const response = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const errorKey = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof errorKey === "string" ? errorKey : "messages.error_unable_to_delete");
      }
      const updatedMessages = await fetchMessages(fetchScope);
      setMessages(updatedMessages);
      const remainingIds = new Set(updatedMessages.map((entry) => entry.id));
      setExpandedMessageIds((current) => new Set([...current].filter((id) => remainingIds.has(id))));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "messages.error_unable_to_delete");
    } finally {
      setDeletingMessageIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
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

  const isAdmin = member.role === "admin";
  const receivedMessages = messages.filter((message) => message.recipientMemberId === member.publicId);
  const sentMessages = messages.filter((message) => message.senderMemberId === member.publicId);
  const messageTree = buildMessageTree(tab === "all" ? messages : tab === "sent" ? sentMessages : receivedMessages);

  function renderMessage(node: MessageNode): ReactNode {
    const { message } = node;
    const sentByCurrentMember = message.senderMemberId === member.publicId;
    const receivedByCurrentMember = message.recipientMemberId === member.publicId;
    const canReply = sentByCurrentMember || receivedByCurrentMember;
    const isCollapsed = !expandedMessageIds.has(message.id);
    const isReply = Boolean(message.replyToId);
    const isUnread = Boolean(message.unread) && receivedByCurrentMember;
    return <li className="message-tree-node" key={message.id}>
      <article className={isUnread ? "message-card message-unread" : "message-card"}>
        <div className="message-card-heading">
          <div className="message-card-main-heading">
            <div className="message-card-subject">
              {!isReply && message.subjectType === "mission" && message.missionCode && <Link
                aria-label={t("messages.open_mission")}
                className="member-icon-action message-subject-link member-link-action"
                data-tooltip={t("messages.open_mission")}
                href={`/missions?search=${encodeURIComponent(message.missionCode)}`}
                title={t("messages.open_mission")}
              ><Crosshair size={15} /></Link>}
              {!isReply && message.subjectType === "planet" && message.portal && <Link
                aria-label={t("messages.open_planet_station")}
                className="member-icon-action message-subject-link member-station-filter"
                data-tooltip={t("messages.open_planet_station")}
                href={`/stations?search=${encodeURIComponent(message.portal)}`}
                title={t("messages.open_planet_station")}
              ><Orbit size={15} /></Link>}
              {!isReply && <h2>{message.subject || t("messages.no_subject")}</h2>}
            </div>
            <p className="message-participants">
              {t("messages.from")} <strong className={sentByCurrentMember ? "current-member" : undefined}>{message.senderName}</strong>
              {" · "}{t("messages.to")}               <strong className={receivedByCurrentMember ? "current-member" : undefined}>{message.recipientName}</strong>
            </p>
          </div>
          <div className="message-card-tools">
            {isUnread && <button
              aria-label={t("messages.mark_read")}
              className="member-icon-action"
              onClick={() => void markRead([message.id])}
              title={t("messages.mark_read")}
              type="button"
            ><MailCheck size={14} /></button>}
            <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
            {(canReply || isAdmin) && <button
              aria-label={t("messages.delete_message")}
              className="member-icon-action delete-member"
              disabled={deletingMessageIds.has(message.id)}
              onClick={() => void deleteMessage(message)}
              title={t("messages.delete_message")}
              type="button"
            ><Trash2 size={14} /></button>}
          </div>
        </div>
        <p className="message-body">{message.body}</p>
        <div className="message-card-actions">
          {node.children.length > 0 && <button
            aria-expanded={!isCollapsed}
            aria-label={t(isCollapsed ? "messages.show_replies" : "messages.hide_replies", { count: node.children.length })}
            className="member-icon-action message-thread-toggle"
            title={t(isCollapsed ? "messages.show_replies" : "messages.hide_replies", { count: node.children.length })}
            onClick={() => {
              if (isCollapsed) void markRead([message.id, ...node.children.map((child) => child.message.id)]);
              setExpandedMessageIds((current) => {
              const next = new Set(current);
              if (next.has(message.id)) next.delete(message.id);
              else next.add(message.id);
              return next;
              });
            }}
            type="button"
          >{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<span className="thread-count">{node.children.length}</span></button>}
          {canReply && replyingTo !== message.id && <button className="member-icon-action message-reply-button" onClick={() => {
            setReplyError("");
            setReplyBody("");
            setReplyAcknowledged(false);
            setReplyingTo(message.id);
          }} type="button" aria-label={t("messages.reply")} title={t("messages.reply")}><Reply size={14} /></button>}
        </div>
        {canReply && replyingTo === message.id && <form className="message-reply-form" onSubmit={(event) => void sendReply(event, message)}>
          <label className="field">
            <span>{t("messages.reply_to", { subject: message.subject || t("messages.no_subject") })}</span>
            <textarea autoFocus maxLength={2000} onChange={(event) => setReplyBody(event.target.value)} required rows={4} value={replyBody} />
          </label>
          <label className="message-acknowledgement">
            <input checked={replyAcknowledged} onChange={(event) => setReplyAcknowledged(event.target.checked)} required type="checkbox" />
            <span>{t("profile.message_mission_only_notice")}</span>
          </label>
          {replyError && <p className="form-error"><CircleAlert size={15} />{t(replyError)}</p>}
          <div className="message-reply-actions">
            <button className="member-icon-action delete-member" onClick={() => {
              setReplyingTo(null);
              setReplyError("");
            }} type="button" aria-label={t("common.cancel")} title={t("common.cancel")}><X size={14} /></button>
            <button className="member-icon-action reply-submit" disabled={sendingReply || !replyBody.trim() || !replyAcknowledged} type="submit" aria-label={t("messages.send_reply")} title={t("messages.send_reply")}><Send size={14} /></button>
          </div>
        </form>}
      </article>
      {node.children.length > 0 && !isCollapsed && <ul className="message-thread-children">{node.children.map(renderMessage)}</ul>}
    </li>;
  }

  return <div className="app-shell">
    <Sidebar activeSection="messaggi" currentMember={member} missionCount={missionCount} settings={settings} stationCount={stationCount} offlineCount={offlineCount} userCount={userCount} />
    <section className="main-panel">
      <Header currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="messages.messages" settings={settings} />
      <Hero settings={settings} subtitle={t("messages.page_description")} title="messages.messages" />
      <main className="content-wrap messages-page">
        <Tabs className="member-filter-tabs" items={(["received", "sent", ...(isAdmin ? ["all" as const] : [])] as MessageTab[]).filter((key) => key === tab || key === "received" || (key === "sent" ? sentMessages.length : messages.length) > 0).map((key) => ({
          key,
          label: t(`messages.tab_${key}`),
          count: key === "all" ? messages.length : key === "sent" ? sentMessages.length : receivedMessages.length,
          selected: tab === key,
          onSelect: () => {
            setTab(key);
            void markRead(receivedMessages.map((entry) => entry.id));
            setExpandedMessageIds(new Set());
          },
        }))} label={t("messages.messages")} />
        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {loading
          ? <div className="messages-loading"><LoadingSpinner /></div>
          : messageTree.length === 0
            ? <p className="messages-empty">{t("messages.no_messages")}</p>
            : <>
              <ul className="messages-list">{messageTree.map(renderMessage)}</ul>
            </>}
      </main>
    </section>
    {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
    {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
  </div>;
}
