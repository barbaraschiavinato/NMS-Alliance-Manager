// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventNotificationAdmin } from "@/components/shared/event-notification-controls";
import { defaultEventNotificationSettings } from "@/lib/notifications/event-notifications";
import { json, mockFetch } from "../pages/helpers";
import { renderWithLocale, tr } from "./helpers";

const url = "/api/admin/event-notifications";
const state = { settings: { ...defaultEventNotificationSettings }, readiness: { telegram: true, links: true } };

describe("EventNotificationAdmin", () => {
  it("edits and saves the settings, then sends a test", async () => {
    const settings = { telegramEnabled: true, telegramChatId: "-5", telegramThreadId: "7" };
    const { requests } = mockFetch({
      [`GET ${url}`]: state,
      [`PATCH ${url}`]: { ...state, settings },
      [`POST ${url}`]: { ok: true },
    });
    const { user } = renderWithLocale(<EventNotificationAdmin />);
    await user.click(await screen.findByRole("checkbox", { name: /Telegram/ }));
    await user.type(screen.getByRole("textbox", { name: tr("event_notifications.telegram_chat_id") }), "-5");
    await user.type(screen.getByRole("textbox", { name: tr("event_notifications.telegram_topic_id") }), "7");
    await user.click(screen.getByRole("button", { name: tr("event_notifications.save") }));
    expect(await screen.findByRole("status")).toHaveTextContent(tr("event_notifications.saved"));
    expect(requests("PATCH", url)[0].body).toEqual(settings);
    await user.click(screen.getByRole("button", { name: /Telegram/ }));
    expect(await screen.findByText(tr("event_notifications.test_sent"))).toBeInTheDocument();
  });

  it("warns about missing configuration and shows server errors", async () => {
    mockFetch({
      [`GET ${url}`]: { ...state, readiness: { telegram: false, links: false } },
      [`PATCH ${url}`]: () => json({ error: "event_notifications.invalid_settings" }, 400),
    });
    const { user } = renderWithLocale(<EventNotificationAdmin />);
    await user.click(await screen.findByRole("button", { name: tr("event_notifications.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(tr("event_notifications.invalid_settings"));
  });

  it("falls back to a generic message when loading fails", async () => {
    mockFetch({ [`GET ${url}`]: () => json({}, 500) });
    renderWithLocale(<EventNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent(tr("event_notifications.admin_error"));
  });
});
