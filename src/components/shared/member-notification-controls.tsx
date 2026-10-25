"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { CheckCircle2, CircleAlert, Send, UserCheck } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { MemberNotificationSettings } from "@/lib/notifications/member-notifications";

type AdminState = {
  settings: MemberNotificationSettings;
  readiness: { telegram: boolean; email: boolean; links: boolean };
};

const adminUrl = "/api/admin/member-notifications";
const genericError = "Unable to configure user notifications.";

async function requestJson<T>(method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(adminUrl, {
    method,
    cache: "no-store",
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? genericError);
  return body as T;
}

export function MemberNotificationAdmin() {
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

  function save(event: SubmitEvent<HTMLFormElement>, settings: MemberNotificationSettings) {
    event.preventDefault();
    return run(async () => {
      setData(await requestJson<AdminState>("PATCH", settings));
      setFeedback("User notification settings saved.");
    });
  }

  function test(channel: "telegram" | "email") {
    return run(async () => {
      await requestJson("POST", { channel });
      setFeedback(channel === "email" ? "Test email sent to your address." : "User test notification sent.");
    });
  }

  return (
    <section className="admin-section taxi-notification-admin">
      <h3>
        <UserCheck size={15} />
        {t("User notifications")}
      </h3>
      {!data && !error && <p>{t("Loading notification settings…")}</p>}
      {data && (
        <form className="taxi-notification-form" onSubmit={(event) => save(event, data.settings)}>
          <p className="field-hint">
            {t(
              "Telegram alerts for new registrations and for approvals, blocks, role changes and removals of users, plus an email when an account is approved.",
            )}
          </p>
          {!data.readiness.links && (
            <p className="form-error">{t("Configure AUTH_URL for notification detail links.")}</p>
          )}
          <div className="taxi-notification-channel">
            <label className="message-acknowledgement">
              <input
                type="checkbox"
                checked={data.settings.telegramEnabled}
                disabled={busy}
                onChange={(event) =>
                  setData({ ...data, settings: { ...data.settings, telegramEnabled: event.target.checked } })
                }
              />
              <span>Telegram — {t("Enabled")}</span>
            </label>
            <p className={`taxi-notification-status ${data.readiness.telegram ? "is-ready" : "is-missing"}`}>
              {data.readiness.telegram ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              {t(data.readiness.telegram ? "Credentials configured" : "Credentials missing or invalid")}
            </p>
            <button
              type="button"
              className="quiet-button"
              disabled={busy || !data.settings.telegramEnabled || !data.readiness.telegram || !data.readiness.links}
              onClick={() => void test("telegram")}
            >
              <Send size={14} />
              {t("Send test")} — Telegram
            </button>
            <label className="field taxi-notification-chat">
              <span>{t("Users Telegram group chat ID")}</span>
              <input
                value={data.settings.telegramChatId}
                maxLength={21}
                placeholder="-123456789"
                disabled={busy}
                onChange={(event) =>
                  setData({ ...data, settings: { ...data.settings, telegramChatId: event.target.value.trim() } })
                }
              />
            </label>
            <label className="field taxi-notification-chat">
              <span>{t("Users Telegram topic ID (optional)")}</span>
              <input
                value={data.settings.telegramThreadId}
                aria-describedby="member-telegram-topic-hint"
                inputMode="numeric"
                maxLength={10}
                placeholder="123"
                disabled={busy}
                onChange={(event) =>
                  setData({ ...data, settings: { ...data.settings, telegramThreadId: event.target.value.trim() } })
                }
              />
            </label>
            <p className="field-hint" id="member-telegram-topic-hint">
              {t("Leave empty to send without selecting a Telegram topic.")}
            </p>
          </div>
          <div className="taxi-notification-channel">
            <label className="message-acknowledgement">
              <input
                type="checkbox"
                checked={data.settings.approvalEmailEnabled}
                disabled={busy}
                onChange={(event) =>
                  setData({ ...data, settings: { ...data.settings, approvalEmailEnabled: event.target.checked } })
                }
              />
              <span>Email — {t("Enabled")}</span>
            </label>
            <p className="field-hint">{t("Sends the user one email when their account is approved.")}</p>
            <p className={`taxi-notification-status ${data.readiness.email ? "is-ready" : "is-missing"}`}>
              {data.readiness.email ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              {t(data.readiness.email ? "Credentials configured" : "Credentials missing or invalid")}
            </p>
            <button
              type="button"
              className="quiet-button"
              disabled={busy || !data.settings.approvalEmailEnabled || !data.readiness.email || !data.readiness.links}
              onClick={() => void test("email")}
            >
              <Send size={14} />
              {t("Send test email to my address")}
            </button>
          </div>
          <div className="dialog-actions taxi-notification-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {t("Save user notifications")}
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
