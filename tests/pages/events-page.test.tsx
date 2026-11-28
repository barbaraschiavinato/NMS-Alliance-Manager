// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventsPage } from "@/components/pages/events-page";
import type { EventView } from "@/lib/events/event-views";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const member = makeMember({ publicId: "me" });
const day = 24 * 60 * 60 * 1000;

function event(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "e1",
    type: "market",
    title: "Winter market",
    description: "Bring eggs",
    startsAt: new Date(Date.now() + day).toISOString(),
    createdAt: new Date().toISOString(),
    location: { kind: "hub", portal: "0123456789AB", galaxy: 0 },
    creatorId: "me",
    creatorName: "Traveller",
    canManage: true,
    participants: [],
    messages: [],
    ...overrides,
  };
}

function renderEvents(events: EventView[], detailId?: string) {
  const fetch = mockFetch({
    "GET /api/events": { events },
    "PUT /api/events/participation": { events },
    "POST /api/events/messages": { events },
  });
  const page = renderPage(
    <EventsPage
      alliance={defaultAlliance}
      currentMember={member}
      detail={detailId ? { id: detailId, origin: "events" } : undefined}
      missionCount={0}
      stationCount={0}
      stations={[]}
    />,
  );
  return { ...page, ...fetch };
}

describe("events page", () => {
  it("lists upcoming events by default and past ones in their tab", async () => {
    const { user } = renderEvents([
      event(),
      event({ id: "e2", title: "Old meetup", startsAt: new Date(Date.now() - day).toISOString() }),
    ]);
    const row = await screen.findByRole("link", { name: /Winter market/ });
    expect(row.getAttribute("href")).toContain("/events/e1");
    expect(screen.queryByText("Old meetup")).toBeNull();
    await user.click(screen.getByRole("tab", { name: new RegExp(t("events.past")) }));
    expect(screen.getByText("Old meetup")).toBeTruthy();
  });

  it("switches to the extended cards", async () => {
    const { user } = renderEvents([event({ stationHref: "/stations/x?from=events" })]);
    await screen.findByText("Winter market");
    await user.click(screen.getByRole("button", { name: t("events.view_extended") }));
    expect(screen.getByText("Bring eggs")).toBeTruthy();
    expect(screen.getByRole("link", { name: t("missions.open_linked_station") })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t("events.view_compact") }));
    expect(screen.queryByText("Bring eggs")).toBeNull();
  });

  it("answers and writes a message from the detail page", async () => {
    const { user, requests } = renderEvents([event()], "e1");
    const answers = await screen.findByRole("group", { name: t("events.my_participation") });
    await user.click(within(answers).getByRole("button", { name: t("events.status_going") }));
    expect(requests("PUT", "/api/events/participation")[0].body).toEqual({ eventId: "e1", status: "going" });
    await user.type(screen.getByRole("textbox", { name: t("events.new_message") }), "Hello");
    await user.click(screen.getByRole("button", { name: t("events.send_message") }));
    expect(requests("POST", "/api/events/messages")[0].body).toEqual({ eventId: "e1", message: "Hello" });
  });

  it("replies to a specific message", async () => {
    const message = {
      id: "m1",
      senderMemberId: "other",
      senderName: "Nova",
      body: "Who brings eggs?",
      createdAt: new Date().toISOString(),
      canDelete: false,
    };
    const { user, requests } = renderEvents([event({ messages: [message] })], "e1");
    await user.click(await screen.findByRole("button", { name: t("messages.reply") }));
    await user.type(screen.getByRole("textbox", { name: t("messages.reply_to", { subject: "Nova" }) }), "Me");
    await user.click(screen.getByRole("checkbox", { name: t("events.messages_notice") }));
    await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    expect(requests("POST", "/api/events/messages")[0].body).toEqual({ eventId: "e1", message: "Me", replyToId: "m1" });
  });

  it("hides edit and delete from members who cannot manage the event", async () => {
    renderEvents([event({ canManage: false })], "e1");
    await screen.findByText("Winter market");
    expect(screen.queryByRole("button", { name: t("events.edit_named", { event: "Winter market" }) })).toBeNull();
    expect(screen.getByRole("button", { name: t("events.duplicate_named", { event: "Winter market" }) })).toBeTruthy();
  });

  it("asks for the missing fields before saving a new event", async () => {
    const { user, requests } = renderEvents([]);
    await user.click(await screen.findByRole("button", { name: t("events.add_event") }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: t("events.add_event") }));
    expect(within(dialog).getByRole("alert").textContent).toContain(t("events.error_type_required"));
    expect(requests("POST", "/api/events")).toHaveLength(0);
  });
});
