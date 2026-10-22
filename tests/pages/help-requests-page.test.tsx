// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpRequestsPage } from "@/components/pages/help-requests-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, router, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

const me = makeMember({ publicId: "me", nmsName: "Me", role: "user" });
const moderator = makeMember({ publicId: "mod", nmsName: "Mod", role: "moderator", simpleView: false });

function helpRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    senderMemberId: "someone",
    subject: "Verdant Moon",
    body: "Need fuel near the moon",
    portal: "1234567890AB",
    galaxy: 0,
    senderName: "Someone",
    createdAt: "2026-03-01T10:00:00.000Z",
    replies: [],
    ...overrides,
  };
}

function renderHelp(member = me, props: Partial<Parameters<typeof HelpRequestsPage>[0]> = {}) {
  return renderPage(
    <HelpRequestsPage alliance={defaultAlliance} currentMember={member} missionCount={0} stationCount={0} {...props} />,
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("HelpRequestsPage", () => {
  it("keeps embedded mission links contextual to the exact station detail", async () => {
    const source = "/stations/owner%3A1234567890AB%3A0?from=planets";
    window.history.replaceState(null, "", source);
    mockFetch({ "GET /api/help-requests": [helpRequest({ missionCode: "linked-mission" })] });
    renderHelp(me, { systemScope: { portal: "1234567890AB", galaxy: 0 } });
    const link = await screen.findByRole("link", { name: t("messages.open_mission") });
    const url = new URL(link.getAttribute("href")!, window.location.origin);
    expect(url.pathname).toBe("/missions/linked-mission");
    expect(url.searchParams.get("from")).toBe("stations");
    expect(url.searchParams.get("returnTo")).toBe(source);
    expect(url.searchParams.has("source")).toBe(false);
  });

  it.each(["help", "taxi"] as const)("returns to the source after deleting the selected %s thread", async (kind) => {
    const board = kind === "help" ? "help-requests" : "taxi";
    const endpoint = `/api/${kind === "help" ? "help" : "taxi"}-requests`;
    window.history.replaceState(null, "", `/${board}/req-1?returnTo=${encodeURIComponent(`/${board}?search=Pilot`)}`);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch({
      [`GET ${endpoint}`]: [helpRequest({ senderMemberId: me.publicId })],
      [`DELETE ${endpoint}`]: { ok: true },
    });
    const { user } = renderHelp(me, { kind, detailRootId: "req-1" });
    await user.click(await screen.findByRole("button", { name: t(`${kind}.delete_request`) }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/${board}?search=Pilot`));
  });
  it.each(["help", "taxi"] as const)(
    "shows only the selected archived %s thread expanded without board controls",
    async (kind) => {
      mockFetch({
        [`GET /api/${kind === "help" ? "help" : "taxi"}-requests`]: [
          helpRequest({
            archived: true,
            senderMemberId: me.publicId,
            replies: [{ id: "reply", senderName: "Helper", body: "Thread reply", createdAt: "2026-03-01T11:00:00Z" }],
          }),
          helpRequest({ id: "other", body: "Unrelated request" }),
        ],
      });
      renderHelp(me, { kind, detailRootId: "req-1" });
      await screen.findByText("Thread reply");
      expect(screen.getByText("Need fuel near the moon")).toBeInTheDocument();
      expect(screen.queryByText("Unrelated request")).not.toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: t("messages.reply") })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: t("broadcast.restore") })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: t("broadcast.expand") })).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: t(kind === "taxi" ? "details.back_to_taxi" : "details.back_to_help") }),
      ).toHaveAttribute("href", kind === "taxi" ? "/taxi" : "/help-requests");
      expect(screen.queryByRole("button", { name: t("taxi.new_request") })).not.toBeInTheDocument();
    },
  );
  it.each(["help", "taxi"] as const)("archives, collapses and restores %s conversations", async (kind) => {
    const endpoint = `/api/${kind === "help" ? "help" : "taxi"}-requests`;
    const own = helpRequest({
      senderMemberId: me.publicId,
      replies: [{ id: "rep", senderName: "Helper", body: "On the way", createdAt: "2026-03-01T11:00:00.000Z" }],
    });
    const { requests } = mockFetch({
      [`GET ${endpoint}`]: [own],
      [`PATCH ${endpoint}`]: { ok: true },
    });
    const changed = vi.fn();
    window.addEventListener(`${kind}-requests-changed`, changed);
    const { user } = renderHelp(me, { kind });
    await screen.findByText(own.body);
    const archive = screen.getByRole("button", { name: t("broadcast.archive") });
    expect(archive).toHaveAttribute("data-tooltip", t("broadcast.archive"));
    expect(archive.nextElementSibling).toBe(screen.getByRole("button", { name: t(`${kind}.delete_request`) }));
    await user.click(archive);
    await waitFor(() => expect(screen.queryByText(own.body)).not.toBeInTheDocument());
    expect(requests("PATCH", endpoint)[0].body).toEqual({ id: own.id, archived: true });
    await user.click(screen.getByRole("tab", { name: `${t("broadcast.archived")}1` }));
    expect(screen.queryByText(own.body)).not.toBeInTheDocument();
    expect(screen.queryByText("On the way")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: t("broadcast.expand") });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(screen.getByText(own.body)).toBeInTheDocument();
    expect(screen.getByText("On the way")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("messages.reply") })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("broadcast.collapse") }));
    expect(screen.queryByText(own.body)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("broadcast.restore") }));
    await waitFor(() => expect(screen.queryByRole("button", { name: t("broadcast.restore") })).not.toBeInTheDocument());
    expect(screen.getByText(t("broadcast.no_archived_requests"))).toBeInTheDocument();
    expect(requests("PATCH", endpoint)[1].body).toEqual({ id: own.id, archived: false });
    await user.click(screen.getByRole("tab", { name: `${t("broadcast.active")}1` }));
    expect(screen.getByText(own.body)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("messages.reply") })).toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(2);
    window.removeEventListener(`${kind}-requests-changed`, changed);
  });

  it.each(["user", "moderator", "admin"] as const)("uses %s permissions for archive controls", async (role) => {
    mockFetch({
      "GET /api/help-requests": [
        helpRequest(),
        helpRequest({ id: "own", subject: "Mine", senderMemberId: me.publicId }),
      ],
    });
    renderHelp({ ...me, role, simpleView: false });
    await screen.findByText("Mine");
    expect(screen.getAllByRole("button", { name: t("broadcast.archive") })).toHaveLength(role === "user" ? 1 : 2);
  });

  it.each([
    [json({ error: "broadcast.archive_not_allowed" }, 403), "broadcast.archive_not_allowed"],
    [json({}, 503), "broadcast.archive_failed"],
    [json(null, 503), "broadcast.archive_failed"],
    [new Response("Unavailable", { status: 503 }), "broadcast.archive_failed"],
    [
      () => {
        throw "Unavailable";
      },
      "broadcast.archive_failed",
    ],
    [
      () => {
        throw new Error("Network down");
      },
      "Network down",
    ],
  ])("keeps the request and displays archive errors", async (response, error) => {
    mockFetch({
      "GET /api/help-requests": [helpRequest({ senderMemberId: me.publicId })],
      "PATCH /api/help-requests": response,
    });
    const { user } = renderHelp();
    await user.click(await screen.findByRole("button", { name: t("broadcast.archive") }));
    expect(await screen.findByText(t(error))).toBeInTheDocument();
    expect(screen.getByText("Need fuel near the moon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("broadcast.archive") })).toBeEnabled();
  });

  it("closes an open reply form on archive without changing other requests", async () => {
    mockFetch({
      "GET /api/help-requests": [
        helpRequest({ senderMemberId: me.publicId }),
        helpRequest({ id: "other", subject: "Other request", body: "Still open" }),
      ],
      "PATCH /api/help-requests": { ok: true },
    });
    const { user } = renderHelp();
    const own = (await screen.findByText("Need fuel near the moon")).closest("article")!;
    await user.click(within(own).getByRole("button", { name: t("messages.reply") }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    await user.click(within(own).getByRole("button", { name: t("broadcast.archive") }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(screen.getByText("Still open")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: `${t("broadcast.archived")}1` }));
    await user.click(screen.getByRole("button", { name: t("broadcast.expand") }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps archived system requests accessible in the embedded tabs", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest({ archived: true })] });
    const { user } = renderHelp(me, { systemScope: { portal: "1234567890AB", galaxy: 0 } });
    await user.click(await screen.findByRole("tab", { name: `${t("broadcast.archived")}1` }));
    expect(screen.queryByText("Need fuel near the moon")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("broadcast.expand") }));
    expect(screen.getByText("Need fuel near the moon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("broadcast.restore") })).not.toBeInTheDocument();
  });

  it("scopes embedded requests by system and galaxy and preserves replies and deletion", async () => {
    const local = helpRequest({ portal: "2234567890AB", senderMemberId: me.publicId });
    const reply = { id: "reply", senderName: "Helper", body: "Help is coming", createdAt: local.createdAt };
    const unrelated = [
      helpRequest({ id: "galaxy", body: "Other galaxy", galaxy: 1 }),
      helpRequest({ id: "system", body: "Other system", portal: "1234567890AC" }),
      helpRequest({ id: "portal", body: "No portal", portal: undefined }),
      helpRequest({ id: "index", body: "No galaxy", galaxy: undefined }),
    ];
    const { requests } = mockFetch({
      "GET /api/help-requests": vi
        .fn()
        .mockReturnValueOnce([local, ...unrelated])
        .mockReturnValue([{ ...local, replies: [reply] }, ...unrelated]),
      "POST /api/help-requests": { ok: true },
      "DELETE /api/help-requests": { ok: true },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, container } = renderHelp(me, { systemScope: { portal: "1234567890AB", galaxy: 0 } });
    await screen.findByText(local.body);
    for (const request of unrelated) expect(screen.queryByText(request.body)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("help.help_requests") })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toBeNull();
    expect(container.querySelector("main")).toBeNull();
    await user.click(screen.getByRole("button", { name: t("messages.reply") }));
    await user.type(screen.getByRole("textbox"), "Thanks");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    await screen.findByText(reply.body);
    expect(requests("POST", "/api/help-requests")[0].body).toEqual({ message: "Thanks", replyToId: local.id });
    await user.click(screen.getByRole("button", { name: t("help.delete_request") }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: t("help.help_requests") })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(t("help.no_requests"))).not.toBeInTheDocument();
  });

  it("hides an empty scoped block but displays load failures", async () => {
    mockFetch({ "GET /api/help-requests": [] });
    const { unmount, container } = renderHelp(me, { systemScope: { portal: "1234567890AB", galaxy: 0 } });
    await waitFor(() => expect(container.querySelector(".messages-loading")).toBeNull());
    expect(container.querySelector(".detail-section")).toBeNull();
    expect(screen.queryByText(t("help.no_requests"))).not.toBeInTheDocument();
    unmount();
    mockFetch({ "GET /api/help-requests": json({ error: "help.error_unable_to_read" }, 503) });
    renderHelp(me, { systemScope: { portal: "1234567890AB", galaxy: 0 } });
    expect(await screen.findByText(t("help.error_unable_to_read"))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("help.help_requests") })).toBeInTheDocument();
  });
  it("opens profiles for request and reply authors", async () => {
    const { requests } = mockFetch({
      "GET /api/help-requests": [
        helpRequest({
          replies: [
            {
              id: "reply",
              senderMemberId: "me",
              senderName: "Me",
              body: "Coming",
              createdAt: "2026-03-01T11:00:00.000Z",
            },
          ],
        }),
      ],
      "GET /api/members": makeMember({ nmsName: "Profile loaded" }),
    });
    const { user } = renderHelp();
    await user.click(await screen.findByRole("button", { name: "Someone" }));
    await screen.findByText("Profile loaded");
    expect(requests("GET", "/api/members")[0].url.searchParams.get("id")).toBe("someone");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("common.close") }));
    await user.click(screen.getByRole("button", { name: "Me" }));
    await screen.findByText("Profile loaded");
    expect(requests("GET", "/api/members")[1].url.searchParams.get("id")).toBe("me");
  });

  it("shows the empty state", async () => {
    mockFetch({ "GET /api/help-requests": [] });
    renderHelp();
    expect(await screen.findByText(t("help.no_requests"))).toBeInTheDocument();
  });

  it("shows the load error", async () => {
    mockFetch({ "GET /api/help-requests": json({ error: "help.error_unable_to_read" }, 500) });
    renderHelp();
    expect(await screen.findByText(t("help.error_unable_to_read"))).toBeInTheDocument();
  });

  it("lists requests with replies and only lets the author delete as a user", async () => {
    mockFetch({
      "GET /api/help-requests": [
        helpRequest({
          missionCode: "M-1",
          replies: [
            {
              id: "rep-1",
              senderMemberId: "me",
              senderName: "Me",
              body: "On it",
              createdAt: "2026-03-01T11:00:00.000Z",
            },
          ],
        }),
        helpRequest({
          id: "req-2",
          senderMemberId: "me",
          senderName: "Me",
          subject: "",
          body: "My own request",
          portal: undefined,
          galaxy: undefined,
        }),
      ],
    });
    renderHelp();

    const other = (await screen.findByText("Need fuel near the moon")).closest("article")!;
    expect(within(other).getByRole("link", { name: t("messages.open_mission") })).toHaveAttribute(
      "href",
      "/missions/M-1?from=help",
    );
    expect(within(other).getByRole("button", { name: t("planet.open_planet_details") })).toBeInTheDocument();
    const reply = screen.getByText("On it").closest("article")!;
    expect(within(reply).getByRole("button", { name: t("help.delete_request") })).toBeInTheDocument();
    const own = screen.getByText("My own request").closest("article")!;
    expect(within(own).getByRole("heading", { name: t("messages.no_subject") })).toBeInTheDocument();
    expect(within(own).getByRole("button", { name: t("help.delete_request") })).toBeInTheDocument();
    // Solo la propria risposta e la propria richiesta: la richiesta altrui non è eliminabile.
    expect(screen.getAllByRole("button", { name: t("help.delete_request") })).toHaveLength(2);
  });

  it("replies to a request and reloads the list", async () => {
    const { requests } = mockFetch({
      "GET /api/help-requests": vi
        .fn()
        .mockReturnValueOnce([helpRequest()])
        .mockReturnValue([
          helpRequest({
            replies: [
              {
                id: "rep-1",
                senderMemberId: "me",
                senderName: "Me",
                body: "Coming",
                createdAt: "2026-03-01T11:00:00.000Z",
              },
            ],
          }),
        ]),
      "POST /api/help-requests": vi
        .fn()
        .mockReturnValueOnce(json({ error: "help.request_unable_to_save" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    const { user } = renderHelp();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.type(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: "Verdant Moon" }) }),
      "Coming",
    );
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    expect(await screen.findByText(t("help.request_unable_to_save"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    expect(await screen.findByText("Coming")).toBeInTheDocument();
    expect(requests("POST", "/api/help-requests")[1].body).toEqual({ message: "Coming", replyToId: "req-1" });
    expect(screen.queryByRole("button", { name: t("messages.send_reply") })).not.toBeInTheDocument();
  });

  it("cancels a reply", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest()] });
    const { user } = renderHelp();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("button", { name: t("messages.send_reply") })).not.toBeInTheDocument();
  });

  it("lets a moderator delete requests and replies after confirmation", async () => {
    const changed = vi.fn();
    window.addEventListener("help-requests-changed", changed);
    const { requests } = mockFetch({
      "GET /api/help-requests": [
        helpRequest({
          replies: [
            {
              id: "rep-1",
              senderMemberId: "x",
              senderName: "X",
              body: "A reply",
              createdAt: "2026-03-01T11:00:00.000Z",
            },
          ],
        }),
      ],
      "DELETE /api/help-requests": vi
        .fn()
        .mockReturnValueOnce({ ok: true })
        .mockReturnValueOnce(json({ error: "help.request_unable_to_delete" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderHelp(moderator);

    const reply = (await screen.findByText("A reply")).closest("article")!;
    await user.click(within(reply).getByRole("button", { name: t("help.delete_request") }));
    expect(requests("DELETE", "/api/help-requests")).toHaveLength(0);
    await user.click(within(reply).getByRole("button", { name: t("help.delete_request") }));
    await waitFor(() => expect(screen.queryByText("A reply")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenLastCalledWith(t("help.confirm_delete_reply"));
    expect(requests("DELETE", "/api/help-requests")[0].body).toEqual({ id: "rep-1" });

    await user.click(screen.getByRole("button", { name: t("help.delete_request") }));
    expect(await screen.findByText(t("help.request_unable_to_delete"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("help.delete_request") }));
    expect(await screen.findByText(t("help.no_requests"))).toBeInTheDocument();
    expect(confirm).toHaveBeenLastCalledWith(t("help.confirm_delete_request"));
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("help-requests-changed", changed);
  });

  it("opens the planet card of a request", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest()] });
    const { user } = renderHelp();

    await user.click(await screen.findByRole("button", { name: t("planet.open_planet_details") }));
    const dialog = await screen.findByRole("dialog", { name: "Verdant Moon" });
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));
    expect(screen.queryByRole("dialog", { name: "Verdant Moon" })).not.toBeInTheDocument();
  });

  it("falls back to the generic load error when the response has no error key", async () => {
    mockFetch({ "GET /api/help-requests": json({ items: [] }) });
    renderHelp();
    expect(await screen.findByText(t("help.error_unable_to_read"))).toBeInTheDocument();
  });

  it("falls back to the generic load error when the response body is empty", async () => {
    mockFetch({ "GET /api/help-requests": json(null, 500) });
    renderHelp();
    expect(await screen.findByText(t("help.error_unable_to_read"))).toBeInTheDocument();
  });

  it("shows the generic load error when the request cannot be sent", async () => {
    mockFetch({
      "GET /api/help-requests": () => {
        throw "offline";
      },
    });
    renderHelp();
    expect(await screen.findByText(t("help.error_unable_to_read"))).toBeInTheDocument();
  });

  it("ignores the load result after unmounting", async () => {
    let finish: (value: unknown) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const pending = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    mockFetch({ "GET /api/help-requests": pending });
    const errors = vi.spyOn(console, "error");

    renderHelp().unmount();
    renderHelp().unmount();
    finish([helpRequest()]);
    fail(new Error("late failure"));
    await waitFor(() => expect(pending).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).not.toHaveBeenCalled();
    expect(screen.queryByText("late failure")).not.toBeInTheDocument();
  });

  it("shows the raw date when it cannot be parsed", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest({ createdAt: "not-a-date" })] });
    renderHelp();
    expect(await screen.findByText("not-a-date")).toBeInTheDocument();
  });

  it("formats dates in Italian", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest()] });
    renderPage(<HelpRequestsPage alliance={defaultAlliance} currentMember={me} missionCount={0} stationCount={0} />, {
      locale: "it",
    });
    const expected = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date("2026-03-01T10:00:00.000Z"),
    );
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("uses fallback titles for requests without a subject", async () => {
    mockFetch({ "GET /api/help-requests": [helpRequest({ subject: "" })] });
    const { user } = renderHelp();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    expect(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: t("messages.no_subject") }) }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("planet.open_planet_details") }));
    expect(await screen.findByRole("dialog", { name: t("planet.fallback_name") })).toBeInTheDocument();
  });

  it("does not let a user delete replies written by others", async () => {
    mockFetch({
      "GET /api/help-requests": [
        helpRequest({
          replies: [
            {
              id: "rep-1",
              senderMemberId: "x",
              senderName: "X",
              body: "A reply",
              createdAt: "2026-03-01T11:00:00.000Z",
            },
          ],
        }),
      ],
    });
    renderHelp();

    const reply = (await screen.findByText("A reply")).closest("article")!;
    expect(within(reply).queryByRole("button", { name: t("help.delete_request") })).not.toBeInTheDocument();
  });

  it("falls back to generic reply errors", async () => {
    mockFetch({
      "GET /api/help-requests": [helpRequest()],
      "POST /api/help-requests": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockReturnValueOnce(new Response("not json", { status: 500 }))
        .mockImplementationOnce(() => {
          throw "offline";
        }),
    });
    const { user } = renderHelp();

    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.type(
      screen.getByRole("textbox", { name: t("messages.reply_to", { subject: "Verdant Moon" }) }),
      "Coming",
    );
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
      expect(await screen.findByText(t("help.request_unable_to_save"))).toBeInTheDocument();
    }
  });

  it("falls back to generic deletion errors", async () => {
    mockFetch({
      "GET /api/help-requests": [helpRequest({ senderMemberId: "me" })],
      "DELETE /api/help-requests": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockReturnValueOnce(new Response("not json", { status: 500 }))
        .mockImplementationOnce(() => {
          throw "offline";
        }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderHelp();

    const remove = await screen.findByRole("button", { name: t("help.delete_request") });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(remove);
      expect(await screen.findByText(t("help.request_unable_to_delete"))).toBeInTheDocument();
    }
  });

  it("lets an admin save the alliance settings and the own profile", async () => {
    const admin = makeMember({ publicId: "admin", nmsName: "Chief", role: "admin" });
    mockFetch({
      "GET /api/help-requests": [],
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderHelp(admin);

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
