"use client";

import { useState, type SubmitEvent } from "react";
import { CircleAlert, Egg, Send, X } from "lucide-react";
import type { PetEntry } from "@/components/cards/pet-card";
import { useLocale } from "@/components/providers/locale-provider";

// Egg trade request to the discoverer of a pet: a private message that carries the pet as its subject.
export function PetMessageDialog({
  pet,
  onClose,
  onSent,
}: Readonly<{ pet: PetEntry; onClose: () => void; onSent: () => void }>) {
  const { t } = useLocale();
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pet.ownerMemberId) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: pet.ownerMemberId,
          message,
          context: { type: "pet", petId: pet.id },
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorKey = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof errorKey === "string" ? errorKey : "profile.message_unable_to_save");
      }
      onSent();
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "profile.message_unable_to_save");
      setSending(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog
        aria-labelledby="pet-message-title"
        aria-modal="true"
        className="mission-dialog member-card-dialog pet-message-dialog"
        open
      >
        <div className="dialog-heading">
          <div>
            <h2 id="pet-message-title">{t("pets.message_discoverer")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="member-message-form" onSubmit={(event) => void send(event)}>
          <p>{t("profile.message_recipient", { recipient: pet.ownerName })}</p>
          <p className="member-message-subject">
            <strong>{t("profile.message_subject")}</strong>
            <Egg aria-hidden="true" className="pet-message-egg" size={13} />
            {pet.name}
          </p>
          <label className="field">
            <span>{t("profile.message_text")}</span>
            <textarea
              autoFocus
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
              required
              rows={5}
              value={message}
            />
          </label>
          <label className="message-acknowledgement">
            <input
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              required
              type="checkbox"
            />
            <span>{t("messages.pet_only_notice")}</span>
          </label>
          {error && (
            <p className="form-error">
              <CircleAlert size={15} />
              {t(error)}
            </p>
          )}
          <div className="dialog-actions">
            <button className="quiet-button" onClick={onClose} type="button">
              {t("common.cancel")}
            </button>
            <button className="primary-button" disabled={sending || !message.trim() || !acknowledged} type="submit">
              {sending ? t("common.saving") : t("profile.send_message")}
              <Send size={14} />
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
