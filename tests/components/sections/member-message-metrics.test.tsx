// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManagedMember } from "@/components/cards/member-card";
import { MemberList, type MemberFilter } from "@/components/sections/member-list";
import { MessageList } from "@/components/sections/message-list";
import { MissionMetrics } from "@/components/sections/mission-metrics";
import type { MissionFilter } from "@/components/sections/mission-list";
import type { Locale } from "@/lib/translations";
import { makeMember } from "../../helpers/members";
import { makeMission, renderWithLocale } from "../helpers";

vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);

function managed(overrides: Partial<ManagedMember>): ManagedMember {
  return { ...makeMember(overrides), protectedAdmin: false };
}

const members = [
  managed({
    name: "Charlie",
    nmsName: "Comet",
    email: "c@example.com",
    membershipStatus: "approved",
    specialty: "builder",
  }),
  managed({
    name: "alice",
    nmsName: "Aurora",
    email: "a@example.com",
    membershipStatus: "pending",
    specialty: "explorer",
  }),
  managed({ name: "Bob", nmsName: "Blaze", email: "b@example.com", membershipStatus: "blocked", specialty: "ranger" }),
];

const counts: Record<MemberFilter, number> = { all: 3, pending: 1, approved: 1, blocked: 1 };

function renderMembers(overrides: Partial<Parameters<typeof MemberList>[0]> = {}, locale: Locale = "en") {
  const props: Parameters<typeof MemberList>[0] = {
    members,
    counts,
    filter: "all",
    onFilterChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    loading: false,
    error: "",
    notice: "",
    memberActivity: { missionOwnerIds: [], stationOwnerIds: [] },
    canChangeRole: false,
    currentMemberEmail: "me@example.com",
    simpleView: false,
    onStatus: vi.fn(),
    onRole: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithLocale(<MemberList {...props} />, { locale }) };
}

function cardNames() {
  return screen.getAllByRole("article").map((card) => within(card).getByText(/@example\.com/).textContent);
}

describe("MemberList", () => {
  it("lists members sorted by name with status tabs and a footer", async () => {
    const { user, props } = renderMembers();
    expect(cardNames()).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    const tabs = screen.getByRole("tablist", { name: "Filter users by status" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Pending1", "Approved1", "Blocked1", "All3"]);
    expect(screen.getByRole("tab", { name: "All3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Showing 3 of 3 users")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Pending1" }));
    expect(props.onFilterChange).toHaveBeenCalledWith("pending");
    await user.type(screen.getByRole("textbox", { name: "Search users" }), "x");
    expect(props.onSearchChange).toHaveBeenCalledWith("x");
  });

  it("filters by status and hides empty status tabs", () => {
    renderMembers({ filter: "blocked", counts: { all: 3, pending: 0, approved: 3, blocked: 0 } });
    expect(cardNames()).toEqual(["b@example.com"]);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Approved3", "Blocked0", "All3"]);
  });

  it("searches name, email, friend code and translated specialty", () => {
    const { unmount } = renderMembers({ search: "BUILDER" });
    expect(cardNames()).toEqual(["c@example.com"]);
    unmount();
    renderMembers({ search: "costruttore" }, "it");
    expect(cardNames()).toEqual(["c@example.com"]);
  });

  it("searches members without a specialty by their other fields", () => {
    renderMembers({
      members: [...members, managed({ name: "Dana", nmsName: "Drift", email: "d@example.com", specialty: "" })],
      search: "drift",
    });
    expect(cardNames()).toEqual(["d@example.com"]);
  });

  it("shows the empty message for the filter", () => {
    renderMembers({ search: "nobody" });
    expect(screen.getByText("No users match this filter.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 3 users")).toBeInTheDocument();
  });

  it("explains an empty pending queue", () => {
    renderMembers({ filter: "pending", members: [] });
    expect(screen.getByText("There are no requests awaiting approval.")).toBeInTheDocument();
  });

  it("explains when nobody has registered yet, in Italian", () => {
    renderMembers({ members: [], counts: { all: 0, pending: 0, approved: 0, blocked: 0 } }, "it");
    expect(
      screen.getByText("Nessun utente registrato: i membri compariranno dopo il primo accesso con Google."),
    ).toBeInTheDocument();
    expect(screen.getByText("Visualizzati 0 di 0 utenti")).toBeInTheDocument();
  });

  it("shows loading, error and notice states", () => {
    renderMembers({ loading: true, error: "members.search_users", notice: "auth.approved_status_label" });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText("Search users", { selector: ".form-error" })).toBeInTheDocument();
    expect(screen.getByText("Approved", { selector: ".address-valid" })).toBeInTheDocument();
    expect(screen.getByText("Loading users")).toBeInTheDocument();
  });

  it("hides the footer in the simple view", () => {
    renderMembers({ simpleView: true });
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });
});

describe("MessageList", () => {
  it("renders children in a list", () => {
    renderWithLocale(
      <MessageList empty={false} emptyLabel="Nothing" error="" loading={false}>
        <li>first</li>
      </MessageList>,
    );
    expect(screen.getByRole("list")).toHaveTextContent("first");
    expect(screen.queryByText("Nothing")).not.toBeInTheDocument();
  });

  it("shows the empty label", () => {
    renderWithLocale(
      <MessageList empty emptyLabel="Nothing" error="" loading={false}>
        {null}
      </MessageList>,
    );
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a spinner while loading", () => {
    renderWithLocale(
      <MessageList empty emptyLabel="Nothing" error="" loading>
        {null}
      </MessageList>,
      { locale: "it" },
    );
    expect(screen.getByRole("status", { name: "Caricamento" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing")).not.toBeInTheDocument();
  });

  it("shows a translated error instead of the empty label", () => {
    renderWithLocale(
      <MessageList empty emptyLabel="Nothing" error="messages.reply" loading={false}>
        {null}
      </MessageList>,
    );
    expect(screen.getByText("Reply")).toBeInTheDocument();
    expect(screen.queryByText("Nothing")).not.toBeInTheDocument();
  });
});

describe("MissionMetrics", () => {
  const metricCounts: Record<MissionFilter, number> = {
    all: 4,
    in_progress: 1,
    pending: 2,
    pending_assigned: 1,
    pending_unassigned: 1,
    completed: 1,
  };
  const missions = [
    makeMission({ id: "1", priority: "urgent", status: "in_progress" }),
    makeMission({ id: "2", priority: "high", status: "pending" }),
    makeMission({ id: "3", priority: "urgent", status: "completed" }),
    makeMission({ id: "4", priority: "normal", status: "pending" }),
  ];

  function metric(label: string) {
    return screen.getByText(label).closest(".metric") as HTMLElement;
  }

  it("summarises the missions", () => {
    renderWithLocale(<MissionMetrics counts={metricCounts} missions={missions} />);
    expect(screen.getByRole("region", { name: "Mission overview" })).toBeInTheDocument();
    expect(metric("ACTIVE MISSIONS")).toHaveTextContent("1 / 42 Pending");
    expect(metric("COMPLETED")).toHaveTextContent("125% of total");
    expect(metric("HIGH / URGENT PRIORITY")).toHaveTextContent("2");
    expect(metric("UNASSIGNED")).toHaveTextContent("1");
  });

  it("handles no missions, in Italian", () => {
    renderWithLocale(
      <MissionMetrics
        counts={{ all: 0, in_progress: 0, pending: 0, pending_assigned: 0, pending_unassigned: 0, completed: 0 }}
        missions={[]}
      />,
      { locale: "it" },
    );
    expect(screen.getByRole("region", { name: "Riepilogo missioni" })).toBeInTheDocument();
    expect(metric("COMPLETATE")).toHaveTextContent("0% del totale");
  });
});
