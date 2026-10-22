"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { Bell, CheckCircle2, CircleAlert, Send } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { TaxiNotificationChannel, TaxiNotificationSettings } from "@/lib/taxi-notifications";

type AdminState = {
  settings: TaxiNotificationSettings;
  readiness: Record<TaxiNotificationChannel | "links", boolean>;
};
type PushState = { enabled: boolean; available: boolean; publicKey: string | null };

async function requestJson<T>(url: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to configure taxi notifications.");
  return body as T;
}

export function TaxiNotificationAdmin() {
  const { t } = useLocale();
  const [data, setData] = useState<AdminState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    requestJson<AdminState>("/api/admin/taxi-notifications")
      .then((body) => {
        if (active) setData(body);
      })
      .catch((error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : "Unable to configure taxi notifications.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: SubmitEvent<HTMLFormElement>, settings: TaxiNotificationSettings) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      setData(await requestJson<AdminState>("/api/admin/taxi-notifications", "PATCH", settings));
      setFeedback("Taxi notification settings saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to configure taxi notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function test(channel: TaxiNotificationChannel) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await requestJson("/api/admin/taxi-notifications", "POST", { channel });
      setFeedback("Test notification sent. Push tests reach only your enabled devices.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to configure taxi notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section taxi-notification-admin">
      <h3>
        <Bell size={15} />
        {t("Taxi notifications")}
      </h3>
      {!data && !error && <p>{t("Loading notification settings…")}</p>}
      {data && (
        <form className="taxi-notification-form" onSubmit={(event) => save(event, data.settings)}>
          <p className="field-hint">{t("Save settings before sending a test. Changes apply without a restart.")}</p>
          {!data.readiness.links && (
            <p className="form-error">{t("Configure AUTH_URL for notification detail links.")}</p>
          )}
          {(["discord", "telegram", "push"] as const).map((channel) => (
            <div className="taxi-notification-channel" key={channel}>
              <label className="message-acknowledgement">
                <input
                  type="checkbox"
                  checked={data.settings[`${channel}Enabled`]}
                  disabled={busy}
                  onChange={(event) =>
                    setData({ ...data, settings: { ...data.settings, [`${channel}Enabled`]: event.target.checked } })
                  }
                />
                <span>
                  {channel === "push" ? "Web Push" : channel === "discord" ? "Discord" : "Telegram"} — {t("Enabled")}
                </span>
              </label>
              <p className={`taxi-notification-status ${data.readiness[channel] ? "is-ready" : "is-missing"}`}>
                {data.readiness[channel] ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                {t(data.readiness[channel] ? "Credentials configured" : "Credentials missing or invalid")}
              </p>
              <button
                type="button"
                className="quiet-button"
                disabled={
                  busy || !data.settings[`${channel}Enabled`] || !data.readiness[channel] || !data.readiness.links
                }
                onClick={() => void test(channel)}
              >
                <Send size={14} />
                {t("Send test")} — {channel === "push" ? "Web Push" : channel === "discord" ? "Discord" : "Telegram"}
              </button>
              {channel === "telegram" && (
                <>
                  <label className="field taxi-notification-chat">
                    <span>{t("Taxi Telegram group chat ID")}</span>
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
                    <span>{t("Taxi Telegram topic ID (optional)")}</span>
                    <input
                      value={data.settings.telegramThreadId}
                      aria-describedby="taxi-telegram-topic-hint"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="123"
                      disabled={busy}
                      onChange={(event) =>
                        setData({
                          ...data,
                          settings: { ...data.settings, telegramThreadId: event.target.value.trim() },
                        })
                      }
                    />
                  </label>
                  <p className="field-hint" id="taxi-telegram-topic-hint">
                    {t("Leave empty to send without selecting a Telegram topic.")}
                  </p>
                </>
              )}
            </div>
          ))}
          <label className="message-acknowledgement taxi-notification-options">
            <input
              type="checkbox"
              checked={data.settings.repliesEnabled}
              disabled={busy}
              onChange={(event) =>
                setData({ ...data, settings: { ...data.settings, repliesEnabled: event.target.checked } })
              }
            />
            <span>{t("Also notify taxi replies (all channels)")}</span>
          </label>
          <div className="dialog-actions taxi-notification-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {t("Save taxi notifications")}
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

export function TaxiPushPreferences() {
  const { t } = useLocale();
  const [data, setData] = useState<PushState | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const url = "/api/profile/taxi-push";
  useEffect(() => {
    let active = true;
    async function load() {
      const body = await requestJson<PushState>(url);
      const available =
        window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let current: PushSubscription | null = null;
      if (available) {
        const registration = await navigator.serviceWorker.getRegistration("/taxi-push-sw.js");
        current = (await registration?.pushManager.getSubscription()) ?? null;
      }
      if (active) {
        setData(body);
        setSupported(available);
        setSubscription(current);
      }
    }
    load().catch((error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : "Unable to configure taxi push notifications.");
    });
    return () => {
      active = false;
    };
  }, []);

  async function preference(enabled: boolean, current: PushState) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await requestJson(url, "PATCH", { enabled });
      setData({ ...current, enabled });
      setFeedback("Taxi notification settings saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to configure taxi push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!data?.publicKey || !supported) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("Browser notification permission was not granted. Check your browser settings.");
      const registration = await navigator.serviceWorker.register("/taxi-push-sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(data.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (character) =>
        character.charCodeAt(0),
      );
      const current =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      setSubscription(current);
      await requestJson(url, "POST", current.toJSON());
      setFeedback("This browser is connected for taxi notifications.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to configure taxi push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(current: PushSubscription) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await requestJson(url, "DELETE", { endpoint: current.endpoint });
      await current.unsubscribe();
      setSubscription(null);
      setFeedback("This browser is disconnected.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to configure taxi push notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <h3>{t("Taxi browser notifications")}</h3>
      {data && (
        <>
          <label className="message-acknowledgement">
            <input
              type="checkbox"
              checked={data.enabled}
              disabled={busy}
              onChange={(event) => void preference(event.target.checked, data)}
            />
            <span>{t("Receive taxi notifications on my connected devices")}</span>
          </label>
          {!data.available && (
            <p className="field-hint">{t("Taxi push notifications are disabled by the administrator.")}</p>
          )}
          {supported === false && (
            <p className="field-hint">
              {t(
                "Web Push is unavailable in this browser. On iPhone/iPad, install the app on the Home Screen first (iOS 16.4+).",
              )}
            </p>
          )}
          {supported && (
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={busy || !data.available || !data.enabled}
                onClick={() => void connect()}
              >
                {t(subscription ? "Connect or refresh this browser" : "Connect this browser")}
              </button>
              {subscription && (
                <button
                  type="button"
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => void disconnect(subscription)}
                >
                  {t("Disconnect this browser")}
                </button>
              )}
            </div>
          )}
          <p className="field-hint">
            {t(
              "You will not receive alerts for your own actions. Delivery depends on browser and operating-system support.",
            )}
          </p>
        </>
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
