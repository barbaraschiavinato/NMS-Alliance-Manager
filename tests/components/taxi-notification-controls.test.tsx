// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { TaxiNotificationAdmin, TaxiPushPreferences } from "@/components/shared/taxi-notification-controls";
import { renderWithLocale } from "./helpers";
import { json, mockFetch } from "../pages/helpers";
import { defaultTaxiNotificationSettings } from "@/lib/taxi-notifications";

const adminUrl = "/api/admin/taxi-notifications";
const pushUrl = "/api/profile/taxi-push";
const state = {
  settings: { ...defaultTaxiNotificationSettings },
  readiness: { discord: true, telegram: true, push: true, links: true },
};
const pushState = {
  enabled: true,
  available: true,
  publicKey: "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  toJSON: () => ({ endpoint: "endpoint", keys: {} }),
  unsubscribe: vi.fn(),
};
const registration = { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } };
const serviceWorker = { getRegistration: vi.fn(), register: vi.fn(), ready: Promise.resolve(registration) };
const notification = { requestPermission: vi.fn() };
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
afterEach(() => {
  if (originalServiceWorker) Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});

beforeEach(() => {
  registration.pushManager.getSubscription.mockResolvedValue(null);
  registration.pushManager.subscribe.mockResolvedValue(sub);
  serviceWorker.getRegistration.mockResolvedValue(registration);
  serviceWorker.register.mockResolvedValue(registration);
  notification.requestPermission.mockResolvedValue("granted");
  sub.unsubscribe.mockResolvedValue(true);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", notification);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
});

describe("Taxi notification administration", () => {
  it("uses generic feedback for unexpected load, save and test failures", async () => {
    mockFetch({ [`GET ${adminUrl}`]: () => Promise.reject("unexpected") });
    const failed = renderWithLocale(<TaxiNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi notifications.");
    failed.unmount();
    mockFetch({
      [`GET ${adminUrl}`]: { ...state, settings: { ...state.settings, discordEnabled: true } },
      [`PATCH ${adminUrl}`]: () => Promise.reject("unexpected"),
      [`POST ${adminUrl}`]: () => Promise.reject("unexpected"),
    });
    const { user } = renderWithLocale(<TaxiNotificationAdmin />);
    await user.click(await screen.findByRole("button", { name: "Save taxi notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi notifications.");
    await user.click(screen.getByRole("button", { name: "Send test — Discord" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi notifications.");
  });
  it("ignores a rejected load after unmount", async () => {
    let reject: (reason: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const view = renderWithLocale(<TaxiNotificationAdmin />);
    view.unmount();
    await act(async () => {
      reject("late");
    });
  });
  it("loads, changes and saves independent settings and sends tests for each channel", async () => {
    const { requests } = mockFetch({
      [`GET ${adminUrl}`]: state,
      [`PATCH ${adminUrl}`]: { ...state, settings: { ...state.settings, discordEnabled: true } },
      [`POST ${adminUrl}`]: { ok: true },
    });
    const { user } = renderWithLocale(<TaxiNotificationAdmin />);
    await user.click(await screen.findByRole("checkbox", { name: "Discord — Enabled" }));
    await user.click(screen.getByRole("checkbox", { name: "Telegram — Enabled" }));
    await user.click(screen.getByRole("checkbox", { name: "Web Push — Enabled" }));
    await user.click(screen.getByRole("checkbox", { name: "Also notify taxi replies (all channels)" }));
    await user.type(screen.getByRole("textbox", { name: "Taxi Telegram group chat ID" }), "-123");
    await user.type(screen.getByRole("textbox", { name: "Taxi Telegram topic ID (optional)" }), "123");
    for (const channel of ["Discord", "Telegram", "Web Push"]) {
      await user.click(screen.getByRole("button", { name: `Send test — ${channel}` }));
      expect(await screen.findByRole("status")).toHaveTextContent("Test notification sent.");
    }
    expect(requests("POST", adminUrl).map((call) => call.body)).toEqual([
      { channel: "discord" },
      { channel: "telegram" },
      { channel: "push" },
    ]);
    await user.click(screen.getByRole("button", { name: "Save taxi notifications" }));
    expect(await screen.findByRole("status")).toHaveTextContent("settings saved");
    expect(requests("PATCH", adminUrl)[0].body).toMatchObject({
      discordEnabled: true,
      telegramEnabled: true,
      pushEnabled: true,
      repliesEnabled: false,
      telegramChatId: "-123",
      telegramThreadId: "123",
    });
  });
  it("allows clearing an existing Telegram topic", async () => {
    const { requests } = mockFetch({
      [`GET ${adminUrl}`]: { ...state, settings: { ...state.settings, telegramThreadId: "123" } },
      [`PATCH ${adminUrl}`]: state,
    });
    const { user } = renderWithLocale(<TaxiNotificationAdmin />);
    await user.clear(await screen.findByRole("textbox", { name: "Taxi Telegram topic ID (optional)" }));
    await user.click(screen.getByRole("button", { name: "Save taxi notifications" }));
    expect(await screen.findByRole("status")).toHaveTextContent("settings saved");
    expect(requests("PATCH", adminUrl)[0].body).toMatchObject({ telegramThreadId: "" });
  });
  it("shows missing configuration and disables tests", async () => {
    mockFetch({
      [`GET ${adminUrl}`]: { ...state, readiness: { discord: false, telegram: false, push: false, links: false } },
    });
    renderWithLocale(<TaxiNotificationAdmin />);
    expect(await screen.findByText("Configure AUTH_URL for notification detail links.")).toBeInTheDocument();
    expect(screen.getAllByText("Credentials missing or invalid")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Send test — Discord" })).toBeDisabled();
  });
  it("surfaces load, save and test errors", async () => {
    mockFetch({
      [`GET ${adminUrl}`]: { ...state, settings: { ...state.settings, discordEnabled: true } },
      [`PATCH ${adminUrl}`]: json({ error: "Save failed" }, 503),
      [`POST ${adminUrl}`]: json({ error: "Test failed" }, 503),
    });
    const { user } = renderWithLocale(<TaxiNotificationAdmin />);
    await user.click(await screen.findByRole("button", { name: "Save taxi notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    await user.click(screen.getByRole("button", { name: "Send test — Discord" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Test failed");
  });
  it("shows a generic load failure and ignores loads completed after unmount", async () => {
    mockFetch({ [`GET ${adminUrl}`]: json({}, 503) });
    const view = renderWithLocale(<TaxiNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi notifications.");
    view.unmount();
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const pending = renderWithLocale(<TaxiNotificationAdmin />);
    pending.unmount();
    await act(async () => {
      resolve(json(state));
    });
  });
});

describe("Taxi push preferences", () => {
  it("uses generic feedback for unexpected initialization and action failures", async () => {
    mockFetch({ [`GET ${pushUrl}`]: () => Promise.reject("unexpected") });
    const failed = renderWithLocale(<TaxiPushPreferences />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi push notifications.");
    failed.unmount();
    registration.pushManager.getSubscription.mockResolvedValue(sub);
    mockFetch({
      [`GET ${pushUrl}`]: pushState,
      [`PATCH ${pushUrl}`]: () => Promise.reject("unexpected"),
      [`POST ${pushUrl}`]: () => Promise.reject("unexpected"),
      [`DELETE ${pushUrl}`]: () => Promise.reject("unexpected"),
    });
    const { user } = renderWithLocale(<TaxiPushPreferences />);
    await user.click(await screen.findByRole("button", { name: "Connect or refresh this browser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi push notifications.");
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi push notifications.");
    await user.click(screen.getByRole("button", { name: "Disconnect this browser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure taxi push notifications.");
  });
  it("handles a missing worker registration and ignores a missing public key", async () => {
    serviceWorker.getRegistration.mockResolvedValue(undefined);
    mockFetch({ [`GET ${pushUrl}`]: { ...pushState, publicKey: null } });
    const { user } = renderWithLocale(<TaxiPushPreferences />);
    await user.click(await screen.findByRole("button", { name: "Connect this browser" }));
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });
  it("ignores a rejected load after unmount", async () => {
    let reject: (reason: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const view = renderWithLocale(<TaxiPushPreferences />);
    view.unmount();
    await act(async () => {
      reject("late");
    });
  });
  it("connects a browser, changes the personal preference, refreshes and disconnects", async () => {
    const { requests } = mockFetch({
      [`GET ${pushUrl}`]: pushState,
      [`POST ${pushUrl}`]: { ok: true },
      [`PATCH ${pushUrl}`]: { ok: true },
      [`DELETE ${pushUrl}`]: { ok: true },
    });
    const { user } = renderWithLocale(<TaxiPushPreferences />);
    await user.click(await screen.findByRole("button", { name: "Connect this browser" }));
    expect(notification.requestPermission).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("This browser is connected");
    expect(requests("POST", pushUrl)).toHaveLength(1);
    registration.pushManager.getSubscription.mockResolvedValue(sub);
    await user.click(screen.getByRole("button", { name: "Connect or refresh this browser" }));
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("checkbox"));
    expect(requests("PATCH", pushUrl)[0].body).toEqual({ enabled: false });
    expect(screen.getByRole("button", { name: "Connect or refresh this browser" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Disconnect this browser" }));
    expect(await screen.findByRole("status")).toHaveTextContent("This browser is disconnected.");
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });
  it("detects existing subscriptions and reports denied permission", async () => {
    registration.pushManager.getSubscription.mockResolvedValue(sub);
    notification.requestPermission.mockResolvedValue("denied");
    mockFetch({ [`GET ${pushUrl}`]: pushState });
    const { user } = renderWithLocale(<TaxiPushPreferences />);
    await user.click(await screen.findByRole("button", { name: "Connect or refresh this browser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permission was not granted");
  });
  it("reports unsupported browsers and admin-disabled notifications", async () => {
    vi.stubGlobal("isSecureContext", false);
    mockFetch({ [`GET ${pushUrl}`]: { ...pushState, available: false } });
    renderWithLocale(<TaxiPushPreferences />);
    expect(await screen.findByText(/Web Push is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Taxi push notifications are disabled by the administrator.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows loading and action errors without success feedback", async () => {
    registration.pushManager.getSubscription.mockResolvedValue(sub);
    mockFetch({
      [`GET ${pushUrl}`]: pushState,
      [`POST ${pushUrl}`]: json({ error: "Subscription failed" }, 503),
      [`PATCH ${pushUrl}`]: json({ error: "Preference failed" }, 503),
      [`DELETE ${pushUrl}`]: json({ error: "Delete failed" }, 503),
    });
    const { user } = renderWithLocale(<TaxiPushPreferences />);
    await user.click(await screen.findByRole("button", { name: "Connect or refresh this browser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Subscription failed");
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Preference failed");
    expect(screen.getByRole("checkbox")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Disconnect this browser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows initialization errors and ignores late responses after unmount", async () => {
    mockFetch({ [`GET ${pushUrl}`]: json({ error: "Load failed" }, 503) });
    const view = renderWithLocale(<TaxiPushPreferences />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Load failed");
    view.unmount();
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const pending = renderWithLocale(<TaxiPushPreferences />);
    pending.unmount();
    await act(async () => {
      resolve(json(pushState));
    });
  });
});
