// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagesPage } from "@/components/pages/messages-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const me = makeMember({ publicId: "me", nmsName: "Me", role: "user" });
const admin = makeMember({ publicId: "admin", nmsName: "Boss", role: "admin", simpleView: false });

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    senderMemberId: "friend",
    recipientMemberId: "me",
    senderName: "Friend",
    recipientName: "Me",
    body: "Meet at the station",
    subject: "Planet Alpha",
    subjectType: "planet",
    portal: "1234567890AB",
    galaxy: 0,
    unread: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function renderMessages(member = me) {
  return renderPage(
    <MessagesPage alliance={defaultAlliance} currentMember={member} missionCount={0} stationCount={0} />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MessagesPage", () => {
  it("shows the empty state and the load error", async () => {
    mockFetch({ "GET /api/messages": [] });
    renderMessages();
    expect(await screen.findByText(t("messages.no_messages"))).toBeInTheDocument();
  });

  it("shows the API error when messages cannot be read", async () => {
    mockFetch({ "GET /api/messages": json({ error: "messages.error_unable_to_read" }, 500) });
    renderMessages();
    expect(await screen.findByText(t("messages.error_unable_to_read"))).toBeInTheDocument();
  });

  it("lists received messages with subject links and marks them read", async () => {
    const unreadChanged = vi.fn();
    window.addEventListener("messages-unread-changed", unreadChanged);
    const { requests } = mockFetch({
      "GET /api/messages": [
        message(),
        message({
          id: "msg-2",
          subject: "Mission M-7",
          subjectType: "mission",
          missionCode: "M-7",
          portal: undefined,
          unread: false,
          body: "Mission talk",
        }),
        message({
          id: "msg-3",
          senderMemberId: "me",
          recipientMemberId: "friend",
          senderName: "Me",
          recipientName: "Friend",
          subject: "",
          body: "Sent by me",
          unread: false,
        }),
      ],
      "PATCH /api/messages": { ok: true },
    });
    const { user } = renderMessages();

    expect(await screen.findByText("Meet at the station")).toBeInTheDocument();
    expect(screen.queryByText("Sent by me")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("messages.open_planet_station") })).toHaveAttribute(
      "href",
      "/stations?search=1234567890AB",
    );
    expect(screen.getByRole("link", { name: t("messages.open_mission") })).toHaveAttribute(
      "href",
      "/missions?search=M-7",
    );

    await user.click(screen.getByRole("button", { name: t("messages.mark_read") }));
    await waitFor(() => expect(requests("PATCH", "/api/messages")).toHaveLength(1));
    expect(requests("PATCH", "/api/messages")[0].body).toEqual({ messageIds: ["msg-1"] });
    expect(screen.queryByRole("button", { name: t("messages.mark_read") })).not.toBeInTheDocument();
    await waitFor(() => expect(unreadChanged).toHaveBeenCalled());
    window.removeEventListener("messages-unread-changed", unreadChanged);

    await user.click(screen.getByRole("tab", { name: new RegExp(t("messages.tab_sent")) }));
    expect(screen.getByText("Sent by me")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("messages.no_subject") })).toBeInTheDocument();
    expect(screen.queryByText("Meet at the station")).not.toBeInTheDocument();
  });

  it("expands threads and marks the replies read", async () => {
    const { requests } = mockFetch({
      "GET /api/messages": [
        message({ unread: false }),
        message({ id: "reply-1", replyToId: "msg-1", body: "Sure, see you", unread: true }),
      ],
      "PATCH /api/messages": { ok: true },
    });
    const { user } = renderMessages();

    const toggle = await screen.findByRole("button", { name: t("messages.show_replies", { count: 1 }) });
    expect(screen.queryByText("Sure, see you")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText("Sure, see you")).toBeInTheDocument();
    await waitFor(() => expect(requests("PATCH", "/api/messages")[0]?.body).toEqual({ messageIds: ["reply-1"] }));

    await user.click(screen.getByRole("button", { name: t("messages.hide_replies", { count: 1 }) }));
    expect(screen.queryByText("Sure, see you")).not.toBeInTheDocument();
  });

  it("replies to a message and reloads the list", async () => {
    const { requests } = mockFetch({
      "GET /api/messages": vi
        .fn()
        .mockReturnValueOnce([message({ unread: false })])
        .mockReturnValue([
          message({ unread: false }),
          message({ id: "reply-1", replyToId: "msg-1", body: "Thanks!", unread: false }),
        ]),
      "POST /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({ error: "messages.error_unable_to_send_reply" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    const { user } = renderMessages();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    const send = screen.getByRole("button", { name: t("messages.send_reply") });
    await user.type(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: "Planet Alpha" }) }),
      "On my way",
    );
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    await user.click(send);
    expect(await screen.findByText(t("messages.error_unable_to_send_reply"))).toBeInTheDocument();

    await user.click(send);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: t("messages.send_reply") })).not.toBeInTheDocument(),
    );
    expect(requests("POST", "/api/messages")[1].body).toEqual({ replyToId: "msg-1", message: "On my way" });
    expect(screen.getByRole("button", { name: t("messages.show_replies", { count: 1 }) })).toBeInTheDocument();
  });

  it("cancels a reply", async () => {
    mockFetch({ "GET /api/messages": [message({ unread: false })] });
    const { user } = renderMessages();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("button", { name: t("messages.send_reply") })).not.toBeInTheDocument();
  });

  it("deletes a message after confirmation and reports failures", async () => {
    const { requests } = mockFetch({
      "GET /api/messages": vi
        .fn()
        .mockReturnValueOnce([message({ unread: false })])
        .mockReturnValue([]),
      "DELETE /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({ error: "messages.error_unable_to_delete" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderMessages();

    const remove = await screen.findByRole("button", { name: t("messages.delete_message") });
    await user.click(remove);
    expect(requests("DELETE", "/api/messages")).toHaveLength(0);

    await user.click(remove);
    expect(await screen.findByText(t("messages.error_unable_to_delete"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("messages.delete_message") }));
    expect(await screen.findByText(t("messages.no_messages"))).toBeInTheDocument();
    expect(requests("DELETE", "/api/messages")[1].body).toEqual({ messageId: "msg-1" });
  });

  it("lets the admin read every message and delete other people's messages", async () => {
    const { requests } = mockFetch({
      "GET /api/messages": [
        message({
          senderMemberId: "a",
          recipientMemberId: "b",
          senderName: "Alice",
          recipientName: "Bob",
          body: "Private chat",
          unread: false,
        }),
      ],
    });
    const { user } = renderMessages(admin);

    await waitFor(() =>
      expect(requests("GET", "/api/messages").some((call) => call.url.searchParams.get("scope") === "all")).toBe(true),
    );
    await user.click(await screen.findByRole("tab", { name: new RegExp(t("messages.tab_all")) }));
    const card = screen.getByText("Private chat").closest("article")!;
    expect(within(card).queryByRole("button", { name: t("messages.reply") })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: t("messages.delete_message") })).toBeInTheDocument();
  });

  it("falls back to the generic load error when the response has no error key", async () => {
    mockFetch({ "GET /api/messages": json({ items: [] }) });
    renderMessages();
    expect(await screen.findByText(t("messages.error_unable_to_read"))).toBeInTheDocument();
  });

  it("falls back to the generic load error when the response body is empty", async () => {
    mockFetch({ "GET /api/messages": json(null, 500) });
    renderMessages();
    expect(await screen.findByText(t("messages.error_unable_to_read"))).toBeInTheDocument();
  });

  it("shows the generic load error when the request cannot be sent", async () => {
    mockFetch({
      "GET /api/messages": () => {
        throw "offline";
      },
    });
    renderMessages();
    expect(await screen.findByText(t("messages.error_unable_to_read"))).toBeInTheDocument();
  });

  it("ignores the load result after unmounting", async () => {
    let finish: (value: unknown) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const pending = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    mockFetch({ "GET /api/messages": pending });
    const errors = vi.spyOn(console, "error");

    renderMessages().unmount();
    renderMessages().unmount();
    finish([message()]);
    fail(new Error("late failure"));
    await waitFor(() => expect(pending).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).not.toHaveBeenCalled();
  });

  it("shows the raw date when it cannot be parsed", async () => {
    mockFetch({ "GET /api/messages": [message({ createdAt: "not-a-date" })] });
    renderMessages();
    expect(await screen.findByText("not-a-date")).toBeInTheDocument();
  });

  it("formats dates in Italian", async () => {
    mockFetch({ "GET /api/messages": [message()] });
    renderPage(<MessagesPage alliance={defaultAlliance} currentMember={me} missionCount={0} stationCount={0} />, {
      locale: "it",
    });
    const expected = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date("2026-03-01T10:00:00.000Z"),
    );
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("uses a fallback subject in the reply form", async () => {
    mockFetch({ "GET /api/messages": [message({ subject: "", unread: false })] });
    const { user } = renderMessages();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    expect(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: t("messages.no_subject") }) }),
    ).toBeInTheDocument();
  });

  it("falls back to generic reply errors", async () => {
    mockFetch({
      "GET /api/messages": [message({ unread: false })],
      "POST /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockReturnValueOnce(json(null, 500))
        .mockImplementationOnce(() => {
          throw "offline";
        }),
    });
    const { user } = renderMessages();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.type(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: "Planet Alpha" }) }),
      "On my way",
    );
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
      expect(await screen.findByText(t("messages.error_unable_to_send_reply"))).toBeInTheDocument();
    }
  });

  it("falls back to generic deletion errors", async () => {
    mockFetch({
      "GET /api/messages": [message({ unread: false })],
      "DELETE /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockReturnValueOnce(json(null, 500))
        .mockImplementationOnce(() => {
          throw "offline";
        }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMessages();

    const remove = await screen.findByRole("button", { name: t("messages.delete_message") });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(remove);
      expect(await screen.findByText(t("messages.error_unable_to_delete"))).toBeInTheDocument();
    }
  });

  it("keeps an expanded thread open after deleting one of its replies", async () => {
    const root = message({ unread: false });
    const first = message({ id: "reply-1", replyToId: "msg-1", body: "First reply", unread: false });
    const second = message({ id: "reply-2", replyToId: "msg-1", body: "Second reply", unread: false });
    mockFetch({
      "GET /api/messages": vi.fn().mockReturnValueOnce([root, first, second]).mockReturnValue([root, second]),
      "DELETE /api/messages": { ok: true },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMessages();

    await user.click(await screen.findByRole("button", { name: t("messages.show_replies", { count: 2 }) }));
    const reply = screen.getByText("First reply").closest("article")!;
    await user.click(within(reply).getByRole("button", { name: t("messages.delete_message") }));

    await waitFor(() => expect(screen.queryByText("First reply")).not.toBeInTheDocument());
    expect(screen.getByText("Second reply")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("messages.hide_replies", { count: 1 }) })).toBeInTheDocument();
  });

  it("lets an admin save the alliance settings and the own profile", async () => {
    mockFetch({
      "GET /api/messages": [],
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderMessages(admin);

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed Alliance").length).toBeGreaterThan(0));
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    let profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });
});
