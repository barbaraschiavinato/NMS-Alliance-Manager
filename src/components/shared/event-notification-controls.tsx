"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { AlertIcon, EventIcon, ReadyIcon, SendIcon } from "@/components/shared/icons";
import { useLocale } from "@/components/providers/locale-provider";
import type { EventNotificationSettings } from "@/lib/notifications/event-notifications";

type AdminState = {
  settings: EventNotificationSettings;
  readiness: { telegram: boolean; links: boolean };
};

const adminUrl = "/api/admin/event-notifications";
const genericError = "event_notifications.admin_error";

async function requestJson<T>(method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(adminUrl, {
    method,
    cache: "no-store",
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const body = await response.json();
  if (!response.ok || !body) throw new Error(body?.error ?? genericError);
  return body as T;
}

export function EventNotificationAdmin() {
  const { t } = useLocale();
  const [data, setData] = useState<AdminState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<AdminState>()
      .then((body) => {
        if (active) setData(body);
      })
      .catch((error_: unknown) => {
        if (active) setError(error_ instanceof Error ? error_.message : genericError);
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await action();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : genericError);
    } finally {
      setBusy(false);
    }
  }

  function save(event: SubmitEvent<HTMLFormElement>, settings: EventNotificationSettings) {
    event.preventDefault();
    return run(async () => {
      setData(await requestJson<AdminState>("PATCH", settings));
      setFeedback("event_notifications.saved");
    });
  }

  function change(values: Partial<EventNotificationSettings>) {
    setData((current) => current && { ...current, settings: { ...current.settings, ...values } });
  }

  return (
    <section className="admin-section taxi-notification-admin">
      <h3>
        <EventIcon size={15} />
        {t("event_notifications.title")}
      </h3>
      {!data && !error && <p>{t("Loading notification settings…")}</p>}
      {data && (
        <form className="taxi-notification-form" onSubmit={(event) => void save(event, data.settings)}>
          <p className="field-hint">{t("event_notifications.description")}</p>
          {!data.readiness.links && (
            <p className="form-error">{t("Configure AUTH_URL for notification detail links.")}</p>
          )}
          <div className="taxi-notification-channel">
            <label className="message-acknowledgement">
              <input
                checked={data.settings.telegramEnabled}
                disabled={busy}
                onChange={(event) => change({ telegramEnabled: event.target.checked })}
                type="checkbox"
              />
              <span>Telegram — {t("Enabled")}</span>
            </label>
            <p className={`taxi-notification-status ${data.readiness.telegram ? "is-ready" : "is-missing"}`}>
              {data.readiness.telegram ? <ReadyIcon size={14} /> : <AlertIcon size={14} />}
              {t(data.readiness.telegram ? "Credentials configured" : "Credentials missing or invalid")}
            </p>
            <button
              className="quiet-button"
              disabled={busy || !data.settings.telegramEnabled || !data.readiness.telegram || !data.readiness.links}
              onClick={() =>
                void run(async () => {
                  await requestJson("POST");
                  setFeedback("event_notifications.test_sent");
                })
              }
              type="button"
            >
              <SendIcon size={14} />
              {t("Send test")} — Telegram
            </button>
            <label className="field taxi-notification-chat">
              <span>{t("event_notifications.telegram_chat_id")}</span>
              <input
                disabled={busy}
                maxLength={21}
                onChange={(event) => change({ telegramChatId: event.target.value.trim() })}
                placeholder="-123456789"
                value={data.settings.telegramChatId}
              />
            </label>
            <label className="field taxi-notification-chat">
              <span>{t("event_notifications.telegram_topic_id")}</span>
              <input
                disabled={busy}
                inputMode="numeric"
                maxLength={10}
                onChange={(event) => change({ telegramThreadId: event.target.value.trim() })}
                placeholder="123"
                value={data.settings.telegramThreadId}
              />
            </label>
          </div>
          <div className="dialog-actions taxi-notification-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {t("event_notifications.save")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {feedback && <p role="status">{t(feedback)}</p>}
    </section>
  );
}
