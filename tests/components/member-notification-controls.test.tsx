// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemberNotificationAdmin } from "@/components/shared/member-notification-controls";
import { renderWithLocale } from "./helpers";
import { json, mockFetch } from "../pages/helpers";
import { defaultMemberNotificationSettings } from "@/lib/notifications/member-notifications";

const url = "/api/admin/member-notifications";
const state = {
  settings: { ...defaultMemberNotificationSettings },
  readiness: { telegram: true, email: true, links: true },
};

describe("MemberNotificationAdmin", () => {
  it("loads, edits and saves the Telegram settings, then sends a test", async () => {
    const saved = {
      ...state,
      settings: { telegramEnabled: true, telegramChatId: "-5", telegramThreadId: "", approvalEmailEnabled: false },
    };
    const { requests } = mockFetch({
      [`GET ${url}`]: state,
      [`PATCH ${url}`]: saved,
      [`POST ${url}`]: { ok: true },
    });
    const { user } = renderWithLocale(<MemberNotificationAdmin />);
    expect(await screen.findAllByText("Credentials configured")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Send test — Telegram" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Telegram — Enabled" }));
    await user.type(screen.getByRole("textbox", { name: "Users Telegram group chat ID" }), "-5");
    await user.click(screen.getByRole("button", { name: "Save user notifications" }));
    expect(await screen.findByRole("status")).toHaveTextContent("User notification settings saved.");
    expect(requests("PATCH", url)[0].body).toEqual(saved.settings);
    await user.click(screen.getByRole("button", { name: "Send test — Telegram" }));
    expect(await screen.findByText("User test notification sent.")).toBeInTheDocument();
  });

  it("warns when links or credentials are missing and shows server errors in Italian", async () => {
    mockFetch({
      [`GET ${url}`]: { ...state, readiness: { telegram: false, email: false, links: false } },
      [`PATCH ${url}`]: () => json({ error: "Invalid member notification settings." }, 400),
    });
    const { user } = renderWithLocale(<MemberNotificationAdmin />, { locale: "it" });
    expect(await screen.findAllByText("Credenziali mancanti o non valide")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Salva notifiche utenti" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impostazioni notifiche utenti non valide.");
  });

  it("uses generic feedback when the server error has no message", async () => {
    mockFetch({ [`GET ${url}`]: () => json({}, 500) });
    renderWithLocale(<MemberNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure user notifications.");
  });

  it.each(["succeeds", "fails"])("ignores a load that %s after unmounting", async (outcome) => {
    let settle: () => void = () => {};
    const response = new Promise<Response>((resolve, reject) => {
      settle = () => (outcome === "succeeds" ? resolve(json(state)) : reject(new Error("late")));
    });
    const { fetchMock } = mockFetch({ [`GET ${url}`]: () => response });
    renderWithLocale(<MemberNotificationAdmin />).unmount();
    settle();
    await response.catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses generic feedback when loading fails unexpectedly", async () => {
    mockFetch({ [`GET ${url}`]: () => Promise.reject("unexpected") });
    renderWithLocale(<MemberNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure user notifications.");
  });

  it("edits the topic and falls back to generic feedback when saving or testing fails unexpectedly", async () => {
    mockFetch({
      [`GET ${url}`]: {
        ...state,
        settings: { telegramEnabled: true, telegramChatId: "-5", telegramThreadId: "", approvalEmailEnabled: false },
      },
      [`PATCH ${url}`]: () => Promise.reject("unexpected"),
      [`POST ${url}`]: () => Promise.reject("unexpected"),
    });
    const { user } = renderWithLocale(<MemberNotificationAdmin />);
    await user.type(await screen.findByRole("textbox", { name: "Users Telegram topic ID (optional)" }), " 12");
    expect(screen.getByRole("textbox", { name: "Users Telegram topic ID (optional)" })).toHaveValue("12");
    await user.click(screen.getByRole("button", { name: "Save user notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure user notifications.");
    await user.click(screen.getByRole("button", { name: "Send test — Telegram" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to configure user notifications.");
  });

  it("keeps tests disabled without a valid application URL", async () => {
    mockFetch({
      [`GET ${url}`]: {
        settings: { telegramEnabled: true, telegramChatId: "-5", telegramThreadId: "", approvalEmailEnabled: false },
        readiness: { telegram: true, email: true, links: false },
      },
    });
    renderWithLocale(<MemberNotificationAdmin />);
    expect(await screen.findByText("Configure AUTH_URL for notification detail links.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test — Telegram" })).toBeDisabled();
  });

  it("enables the approval email and sends a test to the administrator's own address", async () => {
    const saved = {
      ...state,
      settings: { ...state.settings, approvalEmailEnabled: true },
    };
    const { requests } = mockFetch({
      [`GET ${url}`]: state,
      [`PATCH ${url}`]: saved,
      [`POST ${url}`]: { ok: true },
    });
    const { user } = renderWithLocale(<MemberNotificationAdmin />);
    const testButton = await screen.findByRole("button", { name: "Send test email to my address" });
    expect(testButton).toBeDisabled();
    expect(screen.getByText("Sends the user one email when their account is approved.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Email — Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save user notifications" }));
    expect(requests("PATCH", url)[0].body).toMatchObject({ approvalEmailEnabled: true });
    await user.click(await screen.findByRole("button", { name: "Send test email to my address" }));
    expect(await screen.findByText("Test email sent to your address.")).toBeInTheDocument();
    expect(requests("POST", url)[0].body).toEqual({ channel: "email" });
  });

  it("shows missing email credentials and keeps the email test disabled, in Italian", async () => {
    mockFetch({
      [`GET ${url}`]: {
        settings: { ...state.settings, approvalEmailEnabled: true },
        readiness: { telegram: true, email: false, links: true },
      },
    });
    renderWithLocale(<MemberNotificationAdmin />, { locale: "it" });
    const testButton = await screen.findByRole("button", { name: "Invia email di prova al mio indirizzo" });
    expect(testButton).toBeDisabled();
    expect(screen.getAllByText("Credenziali mancanti o non valide")).toHaveLength(1);
  });
});
