// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventExamples } from "@/components/guide/event-examples";
import { EventsPage } from "@/components/pages/events-page";
import { eventLocationLabel, formatEventPeriod } from "@/components/cards/event-format";
import type { EventView } from "@/lib/events/event-views";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, router, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const hub = { ...defaultAlliance, portalCode: "10AB12CD34EF" };
const stations = [
  { id: "s1", portal: "1234567890AB", galaxy: 0, name: "Home Base" },
  { id: "s2", portal: "1234567890AC", galaxy: 0 },
];
const future = "2099-01-05T20:00:00.000Z";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function event(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "e1",
    type: "market",
    title: "Winter market",
    description: "Bring eggs",
    startsAt: future,
    createdAt: future,
    location: { kind: "hub", portal: "10AB12CD34EF", galaxy: 0 },
    creatorId: "me",
    creatorName: "Traveller",
    canManage: true,
    participants: [],
    messages: [],
    ...overrides,
  };
}

function renderEvents(
  events: EventView[],
  { detail, role = "user", routes = {} }: { detail?: string; role?: "user" | "admin"; routes?: object } = {},
) {
  const fetch = mockFetch({
    "GET /api/events": { events },
    "POST /api/events": { events, id: "new" },
    "PATCH /api/events": { events, id: "e1" },
    "DELETE /api/events": { events: [] },
    "PUT /api/events/participation": { events },
    "POST /api/events/messages": { events },
    "DELETE /api/events/messages": { events },
    ...routes,
  });
  const page = renderPage(
    <EventsPage
      alliance={hub}
      currentMember={makeMember({ publicId: "me", role, simpleView: role === "user" })}
      detail={detail ? { id: detail, origin: "events" } : undefined}
      missionCount={0}
      stationCount={0}
      stations={stations}
    />,
  );
  return { ...page, ...fetch };
}

const button = (name: string) => screen.getByRole("button", { name });
const field = (name: string) =>
  within(screen.getByRole("dialog")).getByLabelText(name, { selector: "input,select,textarea" });
const payloadOf = (body: unknown) => JSON.parse((body as FormData).get("payload") as string) as Record<string, unknown>;
const set = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const named = (key: string) => t(key, { event: "Winter market" });

function fill() {
  set(t("events.type"), "gathering");
  set(t("events.event_title"), "Meet");
  set(t("events.description_label"), "Photos");
  set(t("events.starts_at"), "2099-02-01T21:00");
}

const submit = () => fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
const alert = () => within(screen.getByRole("dialog")).getByRole("alert").textContent;

describe("event form", () => {
  async function open() {
    const page = renderEvents([]);
    await page.user.click(await screen.findByRole("button", { name: t("events.add_event") }));
    return page;
  }

  it("validates each required field in turn", async () => {
    await open();
    set(t("events.type"), "other");
    submit();
    expect(alert()).toContain(t("events.error_title_required"));
    set(t("events.event_title"), "Meet");
    submit();
    expect(alert()).toContain(t("events.error_description_required"));
    set(t("events.description_label"), "Photos");
    submit();
    expect(alert()).toContain(t("events.error_start_required"));
    set(t("events.starts_at"), "2099-02-01T21:00");
    set(t("events.ends_at"), "2099-02-01T20:00");
    submit();
    expect(alert()).toContain(t("events.error_end_before_start"));
    set(t("events.ends_at"), "");
    set(t("events.location"), "portal");
    submit();
    expect(alert()).toContain(t("events.error_invalid_location"));
  });

  it("creates an event at the hub with an image", async () => {
    const { user, requests } = await open();
    fill();
    set(t("events.ends_at"), "2099-02-01T23:00");
    await user.upload(field(t("events.image")), new File(["x"], "a.png", { type: "image/png" }));
    submit();
    await screen.findByText(t("events.event_added"));
    const form = requests("POST", "/api/events")[0].body as FormData;
    expect(form.get("image")).toBeInstanceOf(File);
    expect(payloadOf(form)).toMatchObject({
      type: "gathering",
      locationKind: "hub",
      startsAt: new Date("2099-02-01T21:00").toISOString(),
      endsAt: new Date("2099-02-01T23:00").toISOString(),
    });
  });

  it("rejects an unsupported image and removes a chosen one", async () => {
    await open();
    fireEvent.change(field(t("events.image")), {
      target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
    });
    expect(alert()).toContain(t("events.error_image_invalid"));
    fireEvent.change(field(t("events.image")), { target: { files: [] } });
    fireEvent.change(field(t("events.image")), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    fireEvent.click(button(t("pets.choose_image")));
    fireEvent.click(button(t("pets.remove_image")));
    expect(screen.queryByRole("button", { name: t("pets.remove_image") })).toBeNull();
    fireEvent.click(button(t("common.close")));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends the chosen station, or the portal address typed in", async () => {
    const { requests, user } = await open();
    fill();
    set(t("events.location"), "station:s2");
    submit();
    await screen.findByText(t("events.event_added"));
    expect(payloadOf(requests("POST", "/api/events")[0].body)).toMatchObject({
      locationKind: "station",
      stationId: "s2",
    });
    await user.click(button(t("events.add_event")));
    fill();
    set(t("events.location"), "portal");
    set(t("stations.galaxy"), "3");
    set(t("stations.12_glyph_portal_address"), "0123456789AB");
    await waitFor(() => {
      submit();
      expect(requests("POST", "/api/events")).toHaveLength(2);
    });
    expect(payloadOf(requests("POST", "/api/events")[1].body)).toMatchObject({
      locationKind: "portal",
      portal: "0123456789AB",
      galaxy: 3,
    });
  });

  it("shows the server error when saving fails", async () => {
    const page = renderEvents([], {
      routes: { "POST /api/events": () => json({ error: "events.error_unable_to_save" }, 503) },
    });
    await page.user.click(await screen.findByRole("button", { name: t("events.add_event") }));
    fill();
    submit();
    await waitFor(() => expect(alert()).toContain(t("events.error_unable_to_save")));
  });
});

describe("event cards", () => {
  async function extended(events: EventView[], options = {}) {
    const page = renderEvents(events, options);
    await screen.findByText(events[0].title);
    await page.user.click(button(t("events.view_extended")));
    return page;
  }

  afterEach(async () => {
    // The chosen view is shared by every page instance: put it back.
    const compact = screen.queryByRole("button", { name: t("events.view_compact") });
    if (compact) fireEvent.click(compact);
  });

  it("edits keeping the location and removing the image", async () => {
    const { user, requests } = await extended([
      event({ imageUrl: "/api/events/image?path=a", endsAt: "2099-01-05T22:00:00.000Z" }),
    ]);
    await user.click(button(named("events.edit_named")));
    await user.click(button(t("pets.remove_image")));
    submit();
    await screen.findByText(t("events.event_updated"));
    expect(payloadOf(requests("PATCH", "/api/events")[0].body)).toMatchObject({
      id: "e1",
      locationKind: "keep",
      removeImage: true,
    });
  });

  it.each([
    [{ kind: "station", portal: "1234567890AB", galaxy: 0, name: "Home Base" }, "station:s1"],
    [{ kind: "station", portal: "FFFFFFFFFFFF", galaxy: 0 }, "portal"],
    [{ kind: "hub", portal: "10AB12CD34EF", galaxy: 0 }, "hub"],
  ] as const)("duplicates an event at %o", async (location, expected) => {
    const { user } = await extended([event({ location })]);
    await user.click(button(named("events.duplicate_named")));
    expect((field(t("events.location")) as HTMLSelectElement).value).toBe(expected);
    expect((field(t("events.event_title")) as HTMLInputElement).value).toBe("Winter market");
  });

  it("deletes after confirmation only", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user, requests } = await extended([event()]);
    await user.click(button(named("events.delete_named")));
    expect(requests("DELETE", "/api/events")).toHaveLength(0);
    await user.click(button(named("events.delete_named")));
    await screen.findByText(t("events.event_deleted"));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("reports a failed deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = await extended([event()], {
      routes: { "DELETE /api/events": () => json({ error: "events.error_unable_to_remove" }, 503) },
    });
    await user.click(button(named("events.delete_named")));
    await screen.findByText(t("events.error_unable_to_remove"));
  });

  it("enlarges the image", async () => {
    const { user } = await extended([event({ imageUrl: "/api/events/image?path=a" })]);
    await user.click(button(t("pets.enlarge_image", { name: "Winter market" })));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filters by type and shows the empty tabs", async () => {
    const { user } = renderEvents([event({ myStatus: "going" })]);
    await screen.findByText("Winter market");
    await user.selectOptions(screen.getByRole("combobox", { name: t("events.type") }), "gathering");
    expect(screen.getByText(t("events.no_upcoming"))).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: new RegExp(t("events.past")) }));
    expect(screen.getByText(t("events.no_past"))).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: new RegExp(t("events.upcoming")) }));
  });

  it("marks ongoing events", async () => {
    renderEvents([event({ startsAt: new Date(Date.now() - 1000).toISOString() })]);
    expect(await screen.findByText(t("events.ongoing"))).toBeTruthy();
  });

  it("reports a list that cannot be loaded", async () => {
    renderEvents([], { routes: { "GET /api/events": () => json({}, 500) } });
    expect(await screen.findByText(t("errors.request_failed"))).toBeTruthy();
  });
});

describe("event detail", () => {
  const message = (id: string, extra = {}) => ({
    id,
    senderMemberId: "other",
    senderName: "",
    body: `Message ${id}`,
    createdAt: future,
    canDelete: true,
    ...extra,
  });
  const detailed = () =>
    event({
      stationHref: "/stations/x?from=events",
      myStatus: "maybe",
      participants: [
        { memberId: "other", name: "Nova", status: "going" },
        { memberId: "me", name: "Traveller", status: "maybe" },
      ],
      messages: [message("m1"), message("m2", { replyToId: "m1" })],
    });

  it("lets staff remove a participant and the member withdraw the answer", async () => {
    const { user, requests } = renderEvents([detailed()], { detail: "e1", role: "admin" });
    await user.click(
      await screen.findByRole("button", { name: t("events.remove_participant_named", { name: "Nova" }) }),
    );
    await user.click(button(t("events.status_maybe")));
    expect(requests("PUT", "/api/events/participation").map((call) => call.body)).toEqual([
      { eventId: "e1", status: null, memberId: "other" },
      { eventId: "e1", status: null },
    ]);
  });

  it("collapses replies, cancels a reply and deletes after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user, requests } = renderEvents([detailed()], { detail: "e1" });
    await screen.findByText("Message m2");
    const toggle = () => screen.getByRole("button", { name: /repl(y|ies)/i, expanded: undefined });
    await user.click(button(t("messages.hide_replies", { count: 1 })));
    expect(screen.queryByText("Message m2")).toBeNull();
    await user.click(button(t("messages.show_replies", { count: 1 })));
    expect(toggle).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: t("messages.reply") })[0]);
    await user.click(button(t("common.cancel")));
    expect(screen.queryByRole("button", { name: t("messages.send_reply") })).toBeNull();
    const remove = screen.getAllByRole("button", { name: t("events.delete_message") })[0];
    await user.click(remove);
    await user.click(remove);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(requests("DELETE", "/api/events/messages")).toHaveLength(1);
  });

  it("keeps the text and reports the error when a message cannot be sent", async () => {
    const { user } = renderEvents([detailed()], {
      detail: "e1",
      routes: { "POST /api/events/messages": () => json({ error: "events.error_unable_to_save" }, 503) },
    });
    const box = await screen.findByRole("textbox", { name: t("events.new_message") });
    await user.type(box, "Hello");
    await user.click(button(t("events.send_message")));
    await screen.findByText(t("events.error_unable_to_save"));
    expect((box as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("is read-only when past, and empty blocks say so", async () => {
    renderEvents([event({ startsAt: "2000-01-01T00:00:00.000Z", canManage: false })], { detail: "e1" });
    expect(await screen.findByText(t("events.past_read_only"))).toBeTruthy();
    expect(screen.getByText(t("events.no_participants"))).toBeTruthy();
    expect(screen.getByText(t("events.no_messages"))).toBeTruthy();
  });

  it("opens the duplicate and leaves the page after deleting", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderEvents([event()], { detail: "e1" });
    await user.click(await screen.findByRole("button", { name: named("events.duplicate_named") }));
    submit();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/events/new?from=events"));
    await user.click(button(named("events.delete_named")));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/events"));
  });

  it("reports an event that is not in the answer", async () => {
    renderEvents([], { detail: "e1" });
    expect(await screen.findByText(t("events.error_unable_to_read"))).toBeTruthy();
  });
});

describe("event formatting and guide examples", () => {
  it("shows the end time, with its date when it is another day", () => {
    expect(formatEventPeriod("2026-12-05T12:00:00.000Z", "2026-12-05T13:00:00.000Z", "en")).toMatch(/– \d\d:\d\d$/);
    expect(formatEventPeriod("2026-12-05T12:00:00.000Z", "2026-12-08T13:00:00.000Z", "it")).toContain("8 dic");
    expect(eventLocationLabel({ kind: "portal", portal: "0123456789AB", galaxy: 0 }, t)).toBe("0123456789AB");
  });

  it("draws the examples in the browser only, without actions", () => {
    expect(renderToString(<EventExamples />)).toBe("");
    renderPage(<EventExamples />);
    fireEvent.click(screen.getByText(t("events.add_event")));
    for (const control of document.querySelectorAll(".event-card .station-actions button")) fireEvent.click(control);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
