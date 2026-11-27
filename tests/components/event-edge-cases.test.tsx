// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventCard } from "@/components/cards/event-card";
import { EventForm } from "@/components/modals/event-form";
import { EventDetailBlocks } from "@/components/sections/event-detail-blocks";
import { EventNotificationAdmin } from "@/components/shared/event-notification-controls";
import type { EventView } from "@/lib/events/event-views";
import { defaultEventNotificationSettings } from "@/lib/notifications/event-notifications";
import { defaultAlliance } from "../helpers/members";
import { mockFetch } from "../pages/helpers";
import { renderWithLocale, tr } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const event: EventView = {
  id: "e1",
  type: "other",
  title: "Meetup",
  description: "Hello",
  startsAt: "2026-01-01T10:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  location: { kind: "hub", portal: "0123456789AB", galaxy: 0 },
  creatorId: "a",
  creatorName: "Nova",
  canManage: false,
  participants: [],
  messages: [
    {
      id: "m1",
      senderMemberId: "a",
      senderName: "Nova",
      body: "Root",
      createdAt: "2026-01-01T00:00:00.000Z",
      canDelete: false,
    },
  ],
};

describe("event edge cases", () => {
  it("marks an ongoing card", () => {
    renderWithLocale(
      <ul>
        <EventCard
          currentMemberId="me"
          event={event}
          now={Date.parse(event.startsAt)}
          onDuplicate={vi.fn()}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText(tr("events.ongoing"))).toBeInTheDocument();
  });

  it("falls back to the portal for a hub duplicate without a hub, with a generic save error", async () => {
    renderWithLocale(
      <EventForm
        alliance={defaultAlliance}
        event={null}
        onClose={vi.fn()}
        onSave={() => Promise.reject("nope")}
        source={event}
        stations={[]}
      />,
    );
    expect(screen.getByLabelText(tr("events.location"), { selector: "select" })).toHaveValue("portal");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(tr("errors.save_failed"));
  });

  it("keeps the reply open when it cannot be sent", async () => {
    const send = vi.fn(async () => false);
    const { user } = renderWithLocale(
      <EventDetailBlocks
        busy={false}
        currentMemberId="me"
        event={event}
        isStaff={false}
        onDeleteMessage={vi.fn()}
        onParticipation={vi.fn()}
        onSendMessage={send}
        past={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: tr("messages.reply") }));
    await user.type(screen.getByRole("textbox", { name: tr("messages.reply_to", { subject: "Nova" }) }), "Hi");
    await user.click(screen.getByRole("checkbox", { name: tr("events.messages_notice") }));
    await user.click(screen.getByRole("button", { name: tr("messages.send_reply") }));
    expect(send).toHaveBeenCalledWith("Hi", "m1");
    expect(screen.getByRole("button", { name: tr("messages.send_reply") })).toBeInTheDocument();
  });

  it("uses a generic message for unexpected notification failures", async () => {
    const state = {
      settings: { ...defaultEventNotificationSettings },
      readiness: { telegram: true, links: true },
    };
    mockFetch({
      "GET /api/admin/event-notifications": state,
      "PATCH /api/admin/event-notifications": () => Promise.reject("offline"),
    });
    const { user } = renderWithLocale(<EventNotificationAdmin />);
    await user.click(await screen.findByRole("button", { name: tr("event_notifications.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(tr("event_notifications.admin_error"));
  });

  it("ignores the settings answer after closing, whatever it is", async () => {
    for (const settle of ["resolve", "reject"] as const) {
      let finish: () => void = () => undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise((resolve, reject) => {
              finish = () => (settle === "resolve" ? resolve(new Response("{}")) : reject("offline"));
            }),
        ),
      );
      const view = renderWithLocale(<EventNotificationAdmin />);
      view.unmount();
      await act(async () => finish());
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject("offline")),
    );
    renderWithLocale(<EventNotificationAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent(tr("event_notifications.admin_error"));
  });
});
