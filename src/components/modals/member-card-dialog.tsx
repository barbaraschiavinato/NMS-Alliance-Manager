"use client";

import { useEffect, useState } from "react";
import { CircleAlert, MessageSquareText, Send, X } from "lucide-react";
import type { MemberRole, MemberSpecialty, NmsPlatform } from "@/lib/member-types";
import { useLocale } from "@/components/locale-provider";
import type { SubmitEvent } from "react";

type MemberCard = {
  publicId: string;
  name: string;
  image: string;
  nmsName: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty | "";
  nmsCode?: string;
  telegramName?: string;
  discordName?: string;
  role?: MemberRole;
  offline?: boolean;
};

export type MemberMessageContext =
  | Readonly<{ type: "planet"; portal: string; galaxy: number; subjectLabel: string }>
  | Readonly<{ type: "mission"; missionCode: string; subjectLabel: string }>;

const specialtyLabels: Record<MemberSpecialty, string> = {
  builder: "common.builder",
  ranger: "common.ranger",
  explorer: "common.explorer",
};

const roleLabels: Record<MemberRole, string> = {
  user: "members.member_role_label",
  moderator: "common.moderator",
  admin: "admin.administrator",
};

export function MemberCardDialog({ memberId, messageContext, onClose }: Readonly<{
  memberId: string;
  messageContext: MemberMessageContext;
  onClose: () => void;
}>) {
  const { t } = useLocale();
  const [profile, setProfile] = useState<MemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [subjectLabel, setSubjectLabel] = useState(messageContext.subjectLabel);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/members?id=${encodeURIComponent(memberId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load the profile.");
        setProfile(body as MemberCard);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_the_profile"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [memberId, t]);

  useEffect(() => {
    if (messageContext.type !== "planet") return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      recipientId: memberId,
      portal: messageContext.portal,
      galaxy: String(messageContext.galaxy),
    });
    fetch(`/api/messages?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the planet subject.");
        const body: unknown = await response.json();
        if (!body || typeof body !== "object" || !("subject" in body) || typeof body.subject !== "string") return;
        setSubjectLabel(body.subject);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) console.error("Unable to load message planet subject", error_);
      });
    return () => controller.abort();
  }, [memberId, messageContext]);

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessageError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: memberId, message, context: messageContext }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const errorKey = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof errorKey === "string" ? errorKey : "profile.message_unable_to_save");
      }
      setMessage("");
      setAcknowledged(false);
      onClose();
    } catch (error_: unknown) {
      setMessageError(error_ instanceof Error ? error_.message : "profile.message_unable_to_save");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="member-card-title" aria-modal="true" className="mission-dialog member-card-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t(composing ? "profile.leave_a_message" : "profile.member_profile")}</span><h2 id="member-card-title">{t(composing ? "profile.write_message" : "profile.nms_profile")}</h2></div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {loading && <p>{t("profile.loading_profile")}</p>}
        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {profile && !composing && <>
          <div className="profile-identity">
            <span className="profile-google-avatar">{profile.image ? <span style={{ backgroundImage: `url("${profile.image}")` }} /> : (profile.nmsName || profile.name).slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile.nmsName || profile.name}</strong><small>{profile.nmsName ? profile.name : t("admin.alliance_member")}</small></span>
          </div>
          <dl className="member-card-details">
            <div><dt>{t("profile.specialty_label")}</dt><dd>{profile.specialty ? t(specialtyLabels[profile.specialty]) : t("profile.no_specialty_specified")}</dd></div>
            <div><dt>{t("profile.platforms_label")}</dt><dd>{profile.platforms.length ? profile.platforms.join(", ") : t("profile.no_platforms_specified")}</dd></div>
            {profile.telegramName && <div><dt>{t("profile.telegram_name_label")}</dt><dd>{profile.telegramName}</dd></div>}
            {profile.discordName && <div><dt>{t("profile.discord_name_label")}</dt><dd>{profile.discordName}</dd></div>}
            {profile.nmsCode && <div><dt>{t("profile.nms_friend_code_label")}</dt><dd>{profile.nmsCode}</dd></div>}
            {profile.role && <div><dt>{t("members.role_label")}</dt><dd>{t(roleLabels[profile.role])}</dd></div>}
          </dl>
          {!profile.offline && <button aria-label={t("profile.leave_a_message")} className="primary-button member-message-open" onClick={() => {
            setMessageSent(false);
            setMessageError("");
            setComposing(true);
          }} type="button"><MessageSquareText size={15} />{t("profile.leave_a_message")}</button>}
        </>}
        {profile && composing && (messageSent
          ? <div className="member-message-success">
            <p className="address-validation address-valid">{t("profile.message_sent")}</p>
            <button className="quiet-button" onClick={() => {
              setComposing(false);
              setMessageSent(false);
            }} type="button">{t("profile.back_to_profile")}</button>
          </div>
          : <form className="member-message-form" onSubmit={(event) => void sendMessage(event)}>
            <p>{t("profile.message_recipient", { recipient: profile.nmsName || profile.name })}</p>
            <p className="member-message-subject"><strong>{t("profile.message_subject")}</strong>{subjectLabel}</p>
            <label className="field">
              <span>{t("profile.message_text")}</span>
              <textarea autoFocus maxLength={2000} onChange={(event) => setMessage(event.target.value)} required rows={5} value={message} />
            </label>
            <label className="message-acknowledgement">
              <input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required type="checkbox" />
              <span>{t("profile.message_mission_only_notice")}</span>
            </label>
            {messageError && <p className="form-error"><CircleAlert size={15} />{t(messageError)}</p>}
            <div className="dialog-actions">
              <button className="quiet-button" onClick={() => {
                setComposing(false);
                setMessageError("");
              }} type="button">{t("common.cancel")}</button>
              <button className="primary-button" disabled={sending || !message.trim() || !acknowledged} type="submit">{sending ? t("common.saving") : t("profile.send_message")}<Send size={14} /></button>
            </div>
          </form>)}
      </dialog>
    </div>
  );
}