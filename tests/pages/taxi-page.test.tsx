// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelpRequestsPage } from "@/components/pages/help-requests-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const member = makeMember({ publicId: "me", role: "user" });
const station = { id: "other:0123456789AB:0", portal: "0123456789AB", galaxy: 0, name: "Home" };
const request = {
  id: "taxi-1",
  senderMemberId: "someone",
  senderName: "Pilot",
  subject: "Eissentam",
  body: "To Eissentam please",
  galaxy: 9,
  createdAt: "2026-01-01T00:00:00.000Z",
  replies: [],
  meetingStation: station,
};
function renderTaxi(alliance = defaultAlliance, currentMember = member) {
  return renderPage(
    <HelpRequestsPage
      kind="taxi"
      taxiStations={[station, { ...station, id: "unnamed", name: undefined }]}
      alliance={alliance}
      currentMember={currentMember}
      missionCount={0}
      stationCount={1}
    />,
  );
}

describe("taxi board", () => {
  it("explains the friend-code requirement and opens the profile instead of the taxi composer", async () => {
    mockFetch({ "/api/taxi-requests": [] });
    const { user } = renderTaxi(defaultAlliance, { ...member, nmsCode: "" });
    expect(screen.getByText(t("taxi.friend_code_required"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: t("taxi.destination_galaxy") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("help.send_request") })).not.toBeInTheDocument();
  });
  it("offers the configured alliance hub third and submits its kind without client coordinates", async () => {
    const { requests } = mockFetch({
      "GET /api/taxi-requests": [],
      "POST /api/taxi-requests": { ok: true },
    });
    const { user } = renderTaxi({ ...defaultAlliance, portalCode: "1123456789AB", galaxy: 9 });
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") }));
    const options = within(dialog).getAllByRole("option");
    expect(options.slice(0, 3).map((option) => option.textContent)).toEqual([
      t("taxi.offline"),
      t("taxi.no_meeting_station"),
      `${t("taxi.alliance_hub")} · Eissentam · 1123456789AB`,
    ]);
    await user.click(options[2]);
    await user.click(within(dialog).getByRole("combobox", { name: t("taxi.destination_galaxy") }));
    await user.click(within(dialog).getByRole("option", { name: "1 · Euclide" }));
    await user.type(within(dialog).getByRole("textbox"), "From the hub");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: t("help.send_request") }));
    await waitFor(() =>
      expect(requests("POST", "/api/taxi-requests")[0].body).toEqual({
        message: "From the hub",
        galaxy: 0,
        meetingPoint: "hub",
      }),
    );
  });

  it.each([
    { portal: "1123456789AB", galaxy: 9 },
    { portal: "1123456789AC", galaxy: 0 },
  ])("keeps the hub as text when no station matches its system and galaxy: %j", async (meetingStation) => {
    mockFetch({
      "/api/taxi-requests": [
        {
          ...request,
          meetingPoint: "hub",
          meetingStation,
        },
      ],
    });
    renderTaxi();
    const title = await screen.findByRole("heading", { name: "Taxi to Eissentam" });
    expect(title.nextElementSibling).toHaveTextContent(t("taxi.alliance_hub"));
    expect(title.nextElementSibling).toHaveTextContent(meetingStation.portal);
    expect(screen.queryByRole("link", { name: t("taxi.open_meeting_station") })).not.toBeInTheDocument();
  });
  it.each(["1123456789ab", "0123456789AB"])(
    "links the hub to a station in its system, ignoring the first glyph: %s",
    async (portal) => {
      mockFetch({
        "/api/taxi-requests": [
          {
            ...request,
            meetingPoint: "hub",
            meetingStation: { portal, galaxy: 0 },
          },
        ],
      });
      renderTaxi();
      const link = await screen.findByRole("link", { name: t("taxi.open_meeting_station") });
      expect(link).toHaveAttribute("href", "/stations?search=0123456789AB");
      expect(link).toHaveTextContent(t("taxi.alliance_hub"));
      expect(link).not.toHaveTextContent(portal);
      expect(link).not.toHaveTextContent("0123456789AB");
      expect(screen.getByRole("heading", { name: "Taxi to Eissentam" }).nextElementSibling).toBe(link);
    },
  );
  it("filters destination galaxies by name and number and submits the zero-based index", async () => {
    const { requests } = mockFetch({
      "GET /api/taxi-requests": [],
      "POST /api/taxi-requests": { ok: true },
    });
    const { user } = renderTaxi();
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    const galaxy = within(dialog).getByRole("combobox", { name: t("taxi.destination_galaxy") });
    await user.type(galaxy, "unknown");
    expect(galaxy).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("status")).toHaveTextContent(t("taxi.no_galaxies"));
    expect(within(dialog).getByRole("button", { name: t("help.send_request") })).toBeDisabled();
    await user.clear(galaxy);
    await user.type(galaxy, "eissentam");
    expect(within(dialog).getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(galaxy).toHaveValue("10 · Eissentam");
    expect(galaxy).toHaveAttribute("aria-invalid", "false");
    await user.clear(galaxy);
    await user.type(galaxy, "256");
    await user.click(within(dialog).getByRole("option", { name: /^256 ·/ }));
    await user.type(within(dialog).getByRole("textbox"), "Last galaxy please");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: t("help.send_request") }));
    await waitFor(() =>
      expect(requests("POST", "/api/taxi-requests")[0].body).toEqual({
        message: "Last galaxy please",
        galaxy: 255,
        meetingPoint: "offline",
      }),
    );
  });

  it.each(["galaxy", "meeting"])("rejects programmatic submission with an invalid %s choice", async (choice) => {
    const { requests } = mockFetch({ "/api/taxi-requests": [] });
    const { user } = renderTaxi();
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    if (choice === "meeting") {
      await user.clear(within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") }));
    }
    fireEvent.submit(dialog.querySelector("form")!);
    expect(
      within(dialog).getAllByText(t(choice === "meeting" ? "taxi.choose_meeting_point" : "taxi.choose_galaxy")).length,
    ).toBeGreaterThan(0);
    expect(requests("POST", "/api/taxi-requests")).toHaveLength(0);
  });

  it("opens and closes the hero composer, with all 256 galaxies and optional meeting stations", async () => {
    mockFetch({ "/api/taxi-requests": [] });
    const { user } = renderTaxi();
    expect(await screen.findByText(t("taxi.no_requests"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${t("taxi.title")}0` })).toHaveClass("active");
    expect(screen.getByRole("button", { name: t("taxi.new_request") }).parentElement).toHaveClass(
      "mission-banner-inner",
    );
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: t("help.send_request") })).toBeDisabled();
    const galaxies = within(dialog).getByRole("combobox", { name: t("taxi.destination_galaxy") });
    expect(galaxies).toHaveValue("");
    expect(galaxies).toHaveAttribute("placeholder", t("taxi.choose_galaxy"));
    await user.click(galaxies);
    expect(within(dialog).getAllByRole("option")).toHaveLength(256);
    await user.click(within(dialog).getByRole("button", { name: t("taxi.toggle_galaxies") }));
    const stations = within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") });
    expect(stations).toHaveValue(t("taxi.offline"));
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(stations);
    expect(stations).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getAllByRole("option")).toHaveLength(4);
    expect(within(dialog).getByRole("option", { name: t("taxi.offline") })).toHaveAttribute("aria-selected", "true");
    await user.click(within(dialog).getByRole("button", { name: t("taxi.toggle_meeting_points") }));
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("taxi.toggle_meeting_points") }));
    expect(within(dialog).getByRole("listbox")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["offline", "arrange", "station"])("submits a request with meeting point: %s", async (meetingPoint) => {
    const { requests } = mockFetch({
      "GET /api/taxi-requests": vi.fn().mockReturnValueOnce([]).mockReturnValue([request]),
      "POST /api/taxi-requests": { ok: true },
    });
    const changed = vi.fn();
    window.addEventListener("taxi-requests-changed", changed);
    try {
      const { user } = renderTaxi();
      await screen.findByText(t("taxi.no_requests"));
      await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("combobox", { name: t("taxi.destination_galaxy") }));
      await user.click(within(dialog).getByRole("option", { name: "10 · Eissentam" }));
      if (meetingPoint !== "offline") {
        const input = within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") });
        await user.clear(input);
        await user.type(input, meetingPoint === "arrange" ? t("taxi.no_meeting_station") : "Home");
        await user.click(
          within(dialog).getByRole("option", {
            name: meetingPoint === "arrange" ? t("taxi.no_meeting_station") : "Home · Euclide · 0123456789AB",
          }),
        );
      }
      await user.type(within(dialog).getByRole("textbox"), "Need a ride");
      await user.click(within(dialog).getByRole("checkbox"));
      await user.click(within(dialog).getByRole("button", { name: t("help.send_request") }));
      expect(await screen.findByText(request.body)).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(requests("POST", "/api/taxi-requests")[0].body).toEqual({
        galaxy: 9,
        message: "Need a ride",
        meetingPoint,
        ...(meetingPoint === "station" ? { stationId: station.id } : {}),
      });
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("taxi-requests-changed", changed);
    }
  });

  it("accepts searchable meeting text only when it matches a suggestion", async () => {
    mockFetch({ "/api/taxi-requests": [] });
    const { user } = renderTaxi();
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") });
    await user.clear(input);
    await user.type(input, "Home");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText(t("taxi.choose_meeting_point"))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t("help.send_request") })).toBeDisabled();
    await user.clear(input);
    await user.type(input, t("taxi.offline"));
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("filters stations by name, portal and galaxy and supports keyboard selection", async () => {
    mockFetch({ "/api/taxi-requests": [] });
    const { user } = renderTaxi();
    await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByRole("combobox", { name: t("taxi.meeting_station") });
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue(t("taxi.no_meeting_station"));
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(input).toHaveValue("0123456789AB · Euclide · 0123456789AB");
    for (const query of ["home", "0123456789ab", "euclid"]) {
      await user.clear(input);
      await user.type(input, query);
      const list = within(dialog).getByRole("listbox");
      expect(within(list).getAllByRole("option")).toHaveLength(query === "home" ? 1 : 2);
      await user.keyboard("{Escape}");
      expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    }
    await user.click(input);
    await user.clear(input);
    await user.type(input, "unknown");
    expect(within(dialog).getByRole("status")).toHaveTextContent(t("taxi.no_meeting_points"));
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(input).toHaveValue("unknown");
    await user.click(within(dialog).getByRole("textbox"));
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
  });

  it.each([json({ error: "taxi.station_not_found" }, 400), json({}, 503), new Error("Network failure")])(
    "shows composer errors and keeps entered data",
    async (failure) => {
      mockFetch({
        "GET /api/taxi-requests": [],
        "POST /api/taxi-requests": () => {
          if (failure instanceof Error) throw failure;
          return failure;
        },
      });
      const { user } = renderTaxi();
      await user.click(screen.getByRole("button", { name: t("taxi.new_request") }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("combobox", { name: t("taxi.destination_galaxy") }));
      await user.click(within(dialog).getByRole("option", { name: "1 · Euclide" }));
      await user.type(within(dialog).getByRole("textbox"), "Need a ride");
      await user.click(within(dialog).getByRole("checkbox"));
      await user.click(within(dialog).getByRole("button", { name: t("help.send_request") }));
      await waitFor(() => expect(dialog.querySelector(".form-error")).not.toBeNull());
      expect(within(dialog).getByRole("textbox")).toHaveValue("Need a ride");
      expect(within(dialog).getByRole("button", { name: t("help.send_request") })).toBeEnabled();
    },
  );

  it.each(["offline", "arrange", undefined])(
    "shows non-station meeting points including legacy requests: %s",
    async (meetingPoint) => {
      mockFetch({ "/api/taxi-requests": [{ ...request, meetingStation: undefined, meetingPoint }] });
      renderTaxi();
      const meeting = await screen.findByText(
        t("taxi.meeting_point_label", {
          point: t(meetingPoint === "offline" ? "taxi.offline" : "taxi.no_meeting_station"),
        }),
      );
      expect(meeting).toBeInTheDocument();
      const title = screen.getByRole("heading", { name: "Taxi to Eissentam" });
      expect(title.nextElementSibling).toBe(meeting);
      expect(screen.queryByRole("link", { name: t("taxi.open_meeting_station") })).not.toBeInTheDocument();
    },
  );

  it("shows destination and meeting point, accepts replies and lets authors delete them", async () => {
    const { requests } = mockFetch({
      "GET /api/taxi-requests": vi
        .fn()
        .mockReturnValueOnce([request])
        .mockReturnValue([
          {
            ...request,
            replies: [
              { id: "r1", senderMemberId: "me", senderName: "Me", body: "On my way", createdAt: request.createdAt },
            ],
          },
        ]),
      "POST /api/taxi-requests": { ok: true },
      "DELETE /api/taxi-requests": { ok: true },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderTaxi();
    expect(await screen.findByRole("heading", { name: "Taxi to Eissentam" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: t("taxi.open_meeting_station") });
    expect(link).toHaveAttribute("href", "/stations?search=0123456789AB");
    expect(link).toHaveTextContent("Home");
    expect(link.querySelector("svg")).toHaveClass("lucide-orbit");
    expect(screen.getByRole("heading", { name: "Taxi to Eissentam" }).nextElementSibling).toBe(link);
    await user.click(screen.getByRole("button", { name: t("messages.reply") }));
    await user.type(screen.getByRole("textbox"), "On my way");
    await user.click(screen.getByRole("checkbox", { name: t("taxi.message_notice") }));
    await user.click(screen.getByRole("button", { name: t("messages.send_reply") }));
    expect(await screen.findByText("On my way")).toBeInTheDocument();
    expect(requests("POST", "/api/taxi-requests")[0].body).toEqual({ message: "On my way", replyToId: "taxi-1" });
    await user.click(screen.getByRole("button", { name: t("taxi.delete_request") }));
    await waitFor(() => expect(screen.queryByText("On my way")).not.toBeInTheDocument());
    expect(requests("DELETE", "/api/taxi-requests")[0].body).toEqual({ id: "r1" });
  });

  it("shows unnamed meeting stations by portal", async () => {
    mockFetch({ "/api/taxi-requests": [{ ...request, meetingStation: { portal: station.portal, galaxy: 0 } }] });
    renderTaxi();
    expect(await screen.findByRole("link", { name: t("taxi.open_meeting_station") })).toHaveTextContent(station.portal);
  });
});
