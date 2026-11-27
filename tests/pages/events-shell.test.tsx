// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventsPage } from "@/components/pages/events-page";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { DetailBackLink, DetailLink } from "@/components/shared/detail-page";
import { NavigationSearchResetProvider } from "@/components/shared/navigation-search-reset";
import type { EventView } from "@/lib/events/event-views";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const event: EventView = {
  id: "e1",
  type: "gathering",
  title: "Photo meetup",
  description: "Bring your ship",
  startsAt: "2099-01-05T20:00:00.000Z",
  createdAt: "2099-01-01T00:00:00.000Z",
  location: { kind: "portal", portal: "0123456789AB", galaxy: 0 },
  creatorId: "gone",
  creatorName: "",
  canManage: false,
  participants: [{ memberId: "gone", name: "", status: "going" }],
  messages: [
    {
      id: "m1",
      senderMemberId: "gone",
      senderName: "Nova",
      body: "Root",
      createdAt: "2099-01-01T00:00:00.000Z",
      canDelete: false,
    },
    {
      id: "m2",
      replyToId: "m1",
      senderMemberId: "gone",
      senderName: "Vega",
      body: "Child",
      createdAt: "2099-01-01T00:00:00.000Z",
      canDelete: false,
    },
  ],
};

function page(detail?: string, member = makeMember({ publicId: "me", role: "admin", simpleView: false })) {
  return (
    <EventsPage
      alliance={defaultAlliance}
      currentMember={member}
      detail={detail ? { id: detail, origin: "events" } : undefined}
      missionCount={0}
      stationCount={0}
      stations={[]}
    />
  );
}

describe("events page shell", () => {
  // Runs first: the chosen view is remembered by the module once a button is clicked.
  it("starts compact when storage cannot be read", async () => {
    // Only the view preference is blocked: the rest of the page keeps its own storage.
    const { getItem, setItem } = Storage.prototype;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === "nms-events-view") throw new Error("blocked");
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "nms-events-view") throw new Error("blocked");
      setItem.call(this, key, value);
    });
    mockFetch({ "GET /api/events": { events: [event] } });
    const { user } = renderPage(page());
    await screen.findByText("Photo meetup");
    expect(screen.queryByText("Bring your ship")).toBeNull();
    await user.click(screen.getByRole("button", { name: t("events.view_extended") }));
    expect(screen.getByText("Bring your ship")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t("events.view_compact") }));
  });

  it("renders on the server before any data is loaded", () => {
    const html = renderToString(
      <LocaleProvider fixedLocale="en">
        <NavigationSearchResetProvider>
          {page(undefined, makeMember({ pulseEffectsEnabled: false }))}
          <DetailBackLink href="/events" label="details.back_to_events" />
          <DetailLink href="/events/e1">Event</DetailLink>
        </NavigationSearchResetProvider>
      </LocaleProvider>,
    );
    expect(html).toContain("pulse-effects-disabled");
    expect(html).toContain('href="/events/e1"');
  });

  it("returns to the event a detail was opened from", () => {
    window.history.replaceState(null, "", "/stations/x?returnTo=%2Fevents%2Fe1");
    renderPage(<DetailBackLink href="/stations" label="details.back_to_stations" />);
    expect(screen.getByRole("link", { name: t("details.back_to_event_detail") }).getAttribute("href")).toBe(
      "/events/e1",
    );
  });

  it("refreshes the time every minute and closes the toast", async () => {
    const interval = vi.spyOn(window, "setInterval");
    mockFetch({ "GET /api/events": () => new Response("not json", { status: 500 }) });
    const { user } = renderPage(page());
    await screen.findByText(t("errors.request_failed"));
    const tick = interval.mock.calls.find((call) => call[1] === 60000)![0] as () => void;
    act(() => tick());
    await user.click(within(screen.getByRole("alert")).getByRole("button"));
    expect(screen.queryByText(t("errors.request_failed"))).toBeNull();
  });

  it("opens and saves the profile and the alliance settings", async () => {
    mockFetch({
      "GET /api/events": { events: [] },
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed" },
      "PATCH /api/profile": () => json(makeMember({ publicId: "me", nmsName: "Updated" })),
    });
    const member = makeMember({ publicId: "me", role: "admin", simpleView: false });
    const { user } = renderPage(page(undefined, member));
    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    await user.click(await screen.findByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed").length).toBeGreaterThan(0));
    await user.click(
      within(screen.getByRole("dialog", { name: t("admin.alliance") })).getByRole("button", {
        name: t("common.close"),
      }),
    );
    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    const profile = screen.getByRole("dialog");
    fireEvent.submit(profile.querySelector("form")!);
    await waitFor(() => expect(screen.getAllByText("Updated").length).toBeGreaterThan(0));
  });

  it("opens a collapsed thread after replying to it, also from a reply", async () => {
    const { calls } = mockFetch({
      "GET /api/events": { events: [event] },
      "POST /api/events/messages": { events: [event] },
    });
    const { user } = renderPage(page("e1"));
    await screen.findByText("Child");
    const answer = async (button: number, name: string) => {
      await user.click(screen.getAllByRole("button", { name: t("messages.reply") })[button]);
      await user.type(screen.getByRole("textbox", { name: t("messages.reply_to", { subject: name }) }), "Hi");
      await user.click(screen.getByRole("checkbox", { name: t("events.messages_notice") }));
      await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    };
    await answer(1, "Vega");
    await user.click(screen.getByRole("button", { name: t("messages.hide_replies", { count: 1 }) }));
    await answer(0, "Nova");
    expect(await screen.findByText("Child")).toBeTruthy();
    expect(
      calls.filter((call) => call.method === "POST").map((call) => (call.body as { replyToId: string }).replyToId),
    ).toEqual(["m2", "m1"]);
  });
});
