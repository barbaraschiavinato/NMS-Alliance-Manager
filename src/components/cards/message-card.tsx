"use client";

import type { ReactNode, SubmitEvent } from "react";
import { ChevronDown, ChevronRight, CircleAlert, Reply, Send, Trash2, X } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";

export function MessageCard({
  unread,
  subjectActions,
  title,
  titleDetails,
  participants,
  createdAt,
  formattedDate,
  toolsAfterDate,
  onDelete,
  deleteLabel,
  deleting,
  body,
  replies,
  toggle,
  onReply,
  form,
  thread,
  disclosure,
}: Readonly<{
  unread?: boolean;
  subjectActions?: ReactNode;
  title?: string;
  titleDetails?: ReactNode;
  participants: ReactNode;
  createdAt: string;
  formattedDate: string;
  toolsAfterDate?: ReactNode;
  onDelete?: () => void;
  deleteLabel: string;
  deleting?: boolean;
  body: string;
  replies?: ReactNode;
  toggle?: Readonly<{ count: number; collapsed: boolean; onToggle: () => void }>;
  onReply?: () => void;
  form?: ReactNode;
  thread?: ReactNode;
  disclosure?: Readonly<{ collapsed: boolean; onToggle: () => void }>;
}>) {
  const { t } = useLocale();
  const toggleLabel = toggle
    ? t(toggle.collapsed ? "messages.show_replies" : "messages.hide_replies", { count: toggle.count })
    : "";

  return (
    <li className="message-tree-node">
      <article className={unread ? "message-card message-unread" : "message-card"}>
        <div className="message-card-heading">
          <div className="message-card-main-heading">
            <div className="message-card-subject">
              {disclosure && (
                <button
                  aria-expanded={!disclosure.collapsed}
                  aria-label={t(disclosure.collapsed ? "broadcast.expand" : "broadcast.collapse")}
                  className="member-icon-action"
                  data-tooltip={t(disclosure.collapsed ? "broadcast.expand" : "broadcast.collapse")}
                  onClick={disclosure.onToggle}
                  type="button"
                >
                  {disclosure.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
              {subjectActions}
              {title !== undefined && <h2>{title}</h2>}
              {titleDetails}
            </div>
            <p className="message-participants">{participants}</p>
          </div>
          <div className="message-card-tools">
            <time dateTime={createdAt}>{formattedDate}</time>
            {toolsAfterDate}
            {onDelete && (
              <button
                aria-label={deleteLabel}
                className="member-icon-action delete-member"
                data-tooltip={deleteLabel}
                disabled={deleting}
                onClick={onDelete}
                title={deleteLabel}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {!disclosure?.collapsed && (
          <>
            <p className="message-body">{body}</p>
            {replies}
            <div className="message-card-actions">
              {toggle && (
                <button
                  aria-expanded={!toggle.collapsed}
                  aria-label={toggleLabel}
                  className="member-icon-action message-thread-toggle"
                  data-tooltip={toggleLabel}
                  onClick={toggle.onToggle}
                  title={toggleLabel}
                  type="button"
                >
                  {toggle.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="thread-count">{toggle.count}</span>
                </button>
              )}
              {onReply && (
                <button
                  aria-label={t("messages.reply")}
                  className="member-icon-action message-reply-button"
                  data-tooltip={t("messages.reply")}
                  onClick={onReply}
                  title={t("messages.reply")}
                  type="button"
                >
                  <Reply size={14} />
                </button>
              )}
            </div>
            {form}
          </>
        )}
      </article>
      {thread}
    </li>
  );
}

export function MessageReplyForm({
  subject,
  rows,
  value,
  onChange,
  acknowledged,
  onAcknowledgedChange,
  error,
  sending,
  onCancel,
  onSubmit,
  acknowledgementLabel = "profile.message_mission_only_notice",
}: Readonly<{
  subject: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  error: string;
  sending: boolean;
  onCancel: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  acknowledgementLabel?: string;
}>) {
  const { t } = useLocale();

  return (
    <form className="message-reply-form" onSubmit={onSubmit}>
      <label className="field">
        <span>{t("messages.reply_to", { subject })}</span>
        <textarea
          autoFocus
          maxLength={2000}
          onChange={(event) => onChange(event.target.value)}
          required
          rows={rows}
          value={value}
        />
      </label>
      <label className="message-acknowledgement">
        <input
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
          required
          type="checkbox"
        />
        <span>{t(acknowledgementLabel)}</span>
      </label>
      {error && (
        <p className="form-error">
          <CircleAlert size={15} />
          {t(error)}
        </p>
      )}
      <div className="message-reply-actions">
        <button
          aria-label={t("common.cancel")}
          className="member-icon-action delete-member"
          data-tooltip={t("common.cancel")}
          onClick={onCancel}
          title={t("common.cancel")}
          type="button"
        >
          <X size={14} />
        </button>
        <button
          aria-label={t("messages.send_reply")}
          className="member-icon-action reply-submit"
          data-tooltip={t("messages.send_reply")}
          disabled={sending || !value.trim() || !acknowledged}
          title={t("messages.send_reply")}
          type="submit"
        >
          <Send size={14} />
        </button>
      </div>
    </form>
  );
}
