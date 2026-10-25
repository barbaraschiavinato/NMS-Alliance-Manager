// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaderboardPage, type LeaderboardBoard } from "@/components/pages/leaderboard-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const me = makeMember({ publicId: "me", nmsName: "Me" });

function entry(index: number, specialty = "explorer") {
  return {
    publicId: index === 0 ? "me" : `p${index}`,
    name: `Pilot ${index}`,
    image: index === 1 ? "/avatar.png" : "",
    specialty,
    count: 20 - index,
  };
}

const boards: LeaderboardBoard[] = [
  {
    id: "alliance_stats",
    title: "leaderboard.board_alliance",
    empty: "",
    entries: [],
    stats: [{ label: "leaderboard.stat_stations", value: 7 }],
  },
  {
    id: "stations",
    title: "leaderboard.board_stations",
    empty: "leaderboard.empty_stations",
    entries: Array.from({ length: 12 }, (_, index) => entry(index)),
  },
  { id: "missions", title: "leaderboard.board_missions", empty: "leaderboard.empty_missions", entries: [] },
  {
    id: "ranger_tasks",
    title: "common.ranger",
    empty: "leaderboard.empty_task",
    role: "ranger",
    entries: [],
    sections: [
      {
        id: "station_claimed",
        title: "system.station_claimed",
        entries: [entry(1, "ranger"), entry(2, "builder"), entry(3, ""), entry(4, "ranger")],
      },
      { id: "renamed", title: "system.renamed", entries: [] },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeaderboardPage", () => {
  it("renders stats, top ten lists, role widgets and empty boards", () => {
    mockFetch({});
    renderPage(
      <LeaderboardPage
        alliance={defaultAlliance}
        boards={boards}
        currentMember={me}
        missionCount={0}
        stationCount={0}
      />,
    );

    const stats = screen.getByRole("heading", { name: t("leaderboard.board_alliance") }).closest("section")!;
    expect(within(stats).getByText(t("leaderboard.stat_stations")).nextSibling).toHaveTextContent("7");

    const stations = screen.getByRole("heading", { name: t("leaderboard.board_stations") }).closest("section")!;
    const rows = within(stations).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveClass("leaderboard-row-me");
    expect(within(rows[1]).getByText("Pilot 1")).toBeInTheDocument();

    const missions = screen.getByRole("heading", { name: t("leaderboard.board_missions") }).closest("section")!;
    expect(within(missions).getByText(t("leaderboard.empty_missions"))).toBeInTheDocument();

    const ranger = screen.getByRole("heading", { name: t("common.ranger"), level: 3 }).closest("section")!;
    expect(within(ranger).getAllByRole("listitem")).toHaveLength(3);
    expect(within(ranger).getByRole("heading", { name: t("system.station_claimed") })).toBeInTheDocument();
    expect(within(ranger).getByText(t("leaderboard.empty_task"))).toBeInTheDocument();
    expect(within(ranger).getAllByRole("img", { name: t("common.ranger") }).length).toBeGreaterThan(0);
  });

  it.each([
    ["stations", "leaderboard.board_stations", "leaderboard.empty_stations"],
    ["missions", "leaderboard.board_missions", "leaderboard.empty_missions"],
  ] as const)("shows the %s accent with its section icon", (accent, title, empty) => {
    mockFetch({});
    renderPage(
      <LeaderboardPage
        alliance={defaultAlliance}
        boards={[{ id: accent, title, empty, accent, entries: [] }]}
        currentMember={me}
        missionCount={0}
        stationCount={0}
      />,
    );
    const section = screen.getByRole("heading", { name: t(title), level: 3 }).closest("section")!;
    expect(section).toHaveClass(`leaderboard-widget-${accent}`);
    expect(section.querySelector("h3 svg")).not.toBeNull();
  });

  it("shows the planets visited board with the planets icon and accent", () => {
    mockFetch({});
    renderPage(
      <LeaderboardPage
        alliance={defaultAlliance}
        boards={[
          {
            id: "planets_visited",
            title: "leaderboard.board_planets_visited",
            empty: "leaderboard.empty_planets_visited",
            accent: "planets",
            entries: [entry(0), entry(1)],
          },
          {
            id: "empty_planets",
            title: "leaderboard.board_planets_visited",
            empty: "leaderboard.empty_planets_visited",
            accent: "planets",
            entries: [],
          },
        ]}
        currentMember={me}
        missionCount={0}
        stationCount={0}
      />,
    );
    const [board, empty] = screen
      .getAllByRole("heading", { name: t("leaderboard.board_planets_visited"), level: 3 })
      .map((heading) => heading.closest("section")!);
    expect(board).toHaveClass("leaderboard-widget-planets");
    expect(board.querySelector("h3 svg")).not.toBeNull();
    expect(within(board).getAllByRole("listitem")).toHaveLength(2);
    expect(within(board).getAllByLabelText(t("leaderboard.board_planets_visited"))[0]).toHaveTextContent("20");
    expect(within(empty).getByText(t("leaderboard.empty_planets_visited"))).toBeInTheDocument();
  });

  it("opens the own profile panel", async () => {
    mockFetch({});
    const { user } = renderPage(
      <LeaderboardPage alliance={defaultAlliance} boards={[]} currentMember={me} missionCount={0} stationCount={0} />,
    );

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    const dialog = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(dialog).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an icon for builder and explorer task boards", () => {
    mockFetch({});
    renderPage(
      <LeaderboardPage
        alliance={defaultAlliance}
        boards={[
          {
            id: "builder_tasks",
            title: "common.builder",
            empty: "leaderboard.empty_task",
            role: "builder",
            entries: [],
          },
          {
            id: "explorer_tasks",
            title: "common.explorer",
            empty: "leaderboard.empty_task",
            role: "explorer",
            entries: [],
          },
        ]}
        currentMember={me}
        missionCount={0}
        stationCount={0}
      />,
    );

    for (const name of [t("common.builder"), t("common.explorer")]) {
      const heading = screen.getByRole("heading", { name, level: 3 });
      expect(heading.querySelector("svg")).not.toBeNull();
      expect(within(heading.closest("section")!).getByText(t("leaderboard.empty_task"))).toBeInTheDocument();
    }
  });

  it("lets an admin save the alliance settings and the own profile", async () => {
    const admin = makeMember({ publicId: "admin", nmsName: "Chief", role: "admin" });
    mockFetch({
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderPage(
      <LeaderboardPage
        alliance={defaultAlliance}
        boards={[]}
        currentMember={admin}
        missionCount={0}
        stationCount={0}
      />,
    );

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
    const profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });
});
