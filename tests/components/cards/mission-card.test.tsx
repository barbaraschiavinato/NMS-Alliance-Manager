// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissionCard } from "@/components/cards/mission-card";
import {
  MemberAvatar,
  planetNotesRequests,
  readPlanetNotes,
  type MissionCardProps,
} from "@/components/cards/mission-card/parts";
import type { AllianceMember } from "@/lib/members/member-types";
import type { Mission } from "@/lib/missions/missions";
import type { Locale } from "@/lib/translations";
import { makeMember } from "../../helpers/members";
import { makeMission, renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("@/lib/nms-core/system.js", () => ({
  systemAttributes: () => ({ star_type: 2 }),
  planetSeeds: () => ({ planet_seeds: [1, 2] }),
}));

type FetchRoutes = { notes?: () => Response; planet?: () => Response };

let missionCounter = 0;
// Le note pianeta sono in cache per id missione: ogni test usa id nuovi.
function mission(overrides: Partial<Mission> = {}) {
  missionCounter += 1;
  return makeMission({ id: `m-${missionCounter}`, ...overrides });
}

function stubFetch({
  notes = () => new Response(JSON.stringify({ note: "" })),
  planet = () => new Response("{}", { status: 404 }),
}: FetchRoutes = {}) {
  const fetchMock = vi.fn(async (url: string) => (url.includes("/planet-notes") ? notes() : planet()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const me = () => makeMember({ publicId: "me", nmsName: "Me", specialty: "explorer", role: "user", simpleView: false });

function renderMissionCard(overrides: Partial<MissionCardProps> = {}, locale: Locale = "en") {
  const props: MissionCardProps = {
    mission: mission(),
    systemStatuses: {},
    currentMember: me(),
    canManage: false,
    stationOwners: [],
    stationOwnersLoaded: true,
    requestedSpecialty: () => null,
    onCreateRangerMission: vi.fn(),
    members: [],
    onEdit: vi.fn(),
    onDeleteMission: vi.fn(),
    onOpenPlanet: vi.fn(),
    onClaim: vi.fn(),
    onComplete: vi.fn(),
    onReopen: vi.fn(),
    onStart: vi.fn(),
    onToggleSystemStatus: vi.fn(),
    onUpdateProgress: vi.fn(async () => undefined),
    onViewNotes: vi.fn(),
    onViewPlanetNotes: vi.fn(),
    onOpenProfile: vi.fn(),
    getDiscovererImage: () => undefined,
    ...overrides,
  };
  return { props, ...renderWithLocale(<MissionCard {...props} />, { locale }) };
}

function assignedToMe(overrides: Partial<Mission> = {}) {
  return mission({ assignedMemberId: "me", assignedTo: "Me", status: "in_progress", ...overrides });
}

beforeEach(() => {
  stubFetch();
});

describe("MissionCard variants", () => {
  it("renders the extended card with the system label for the extended view", async () => {
    const { container } = renderMissionCard({ mission: mission({ system: "Alpha · Lush" }) });
    expect(screen.getByRole("article")).toHaveClass("mission-card-extended");
    expect(screen.getByText("Alpha · Lush")).toBeInTheDocument();
    expect(await screen.findByText("2 planets · blue star")).toBeInTheDocument();
    expect(container.querySelector(".mission-card-system-text")).not.toBeNull();
  });

  it("falls back to a generic system label in the extended card", () => {
    renderMissionCard();
    expect(screen.getByText("System", { selector: ".mission-card-system-text" })).toBeInTheDocument();
  });

  it("renders the simple card for the simple view", () => {
    const { container } = renderMissionCard({
      currentMember: makeMember({ publicId: "me", simpleView: true }),
      mission: mission({ system: "Alpha" }),
    });
    expect(screen.getByRole("article")).not.toHaveClass("mission-card-extended");
    expect(container.querySelector(".mission-card-system-text")).toBeNull();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("uses the given planet image in the simple card without fetching it", async () => {
    const fetchMock = stubFetch();
    const { container } = renderMissionCard({
      currentMember: makeMember({ publicId: "me", simpleView: true }),
      planetImageUrl: "https://example.com/p.png",
    });
    expect(container.querySelector(".mission-card-planet-thumb img")).toHaveAttribute(
      "src",
      "https://example.com/p.png",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/missions/planet?"))).toBe(false);
  });
});

describe.each([
  ["extended", false],
  ["simple", true],
])("MissionCard (%s) content", (_variant, simpleView) => {
  const viewer = () => makeMember({ publicId: "me", nmsName: "Me", specialty: "explorer", role: "user", simpleView });

  it("shows title, description, specialty and priority, and opens the planet", async () => {
    const target = mission({
      title: "Deep Survey",
      description: "Map it all",
      priority: "urgent",
      targetSpecialty: "builder",
    });
    const { user, props } = renderMissionCard({ currentMember: viewer(), mission: target });
    expect(screen.getByText("Map it all")).toBeInTheDocument();
    expect(screen.getByText("Builders")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("Euclide")).not.toHaveClass("mission-galaxy-alert");
    await user.click(screen.getByRole("button", { name: "Open system details for Deep Survey" }));
    expect(props.onOpenPlanet).toHaveBeenCalledWith(target);
  });

  it("warns about missions in other galaxies", () => {
    renderMissionCard({ currentMember: viewer(), mission: mission({ galaxy: 1 }) });
    const galaxy = screen.getByText("Hilbert Dimension");
    expect(galaxy).toHaveClass("mission-galaxy-alert");
    expect(galaxy).toHaveAttribute("data-tooltip", "Make sure you have portals for this galaxy");
  });

  it("shows the Available ribbon and a claim button on unassigned missions", async () => {
    const target = mission();
    const { user, props } = renderMissionCard({ currentMember: viewer(), mission: target });
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    const claimButton = screen.getByRole("button", { name: "Claim" });
    expect(claimButton).toHaveClass("claim-button-pulse");
    await user.click(claimButton);
    expect(props.onClaim).toHaveBeenCalledWith(target);
  });

  it("translates the card into Italian", () => {
    renderMissionCard(
      { currentMember: viewer(), mission: mission({ title: "T", targetSpecialty: "all", priority: "high" }) },
      "it",
    );
    expect(screen.getByText("Disponibile")).toBeInTheDocument();
    expect(screen.getByText("Tutti")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prendi in carico" })).toBeInTheDocument();
    expect(screen.getByText("SCOPRITORE")).toBeInTheDocument();
  });
});

describe("MissionCard row actions", () => {
  it("lets the assignee start a pending mission", async () => {
    const target = assignedToMe({ status: "pending" });
    const { user, props } = renderMissionCard({ mission: target });
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    const startButton = screen.getByRole("button", { name: "Start mission" });
    expect(startButton).toHaveClass("claim-button-start-pulse");
    await user.click(startButton);
    expect(props.onStart).toHaveBeenCalledWith(target);
  });

  it("keeps completion disabled until the assignee's system tasks are done", () => {
    renderMissionCard({ mission: assignedToMe(), systemStatuses: { "0:0123456789AB": ["mapped"] } });
    const completeButton = screen.getByRole("button", { name: "Complete mission" });
    expect(completeButton).toBeDisabled();
    expect(completeButton).not.toHaveClass("claim-button-complete-pulse");
  });

  it("lets the assignee complete a mission once its tasks are done", async () => {
    const target = assignedToMe();
    const { user, props } = renderMissionCard({
      mission: target,
      systemStatuses: { "0:0123456789AB": ["mapped", "planets_classified", "data_uploaded"] },
    });
    const completeButton = screen.getByRole("button", { name: "Complete mission" });
    expect(completeButton).toHaveClass("claim-button-complete-pulse");
    await user.click(completeButton);
    expect(props.onComplete).toHaveBeenCalledWith(target);
  });

  it("shows no action on missions assigned to someone else", () => {
    renderMissionCard({ mission: mission({ assignedMemberId: "other", assignedTo: "Other", status: "in_progress" }) });
    expect(screen.queryByText("—", { selector: ".no-row-action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim|Complete|Start/ })).not.toBeInTheDocument();
  });

  it("shows no action on missions reserved by name only", () => {
    renderMissionCard({ mission: mission({ assignedTo: "Legacy Name" }) });
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("lets the assignee reopen a completed mission", async () => {
    const target = assignedToMe({ status: "completed" });
    const { user, props } = renderMissionCard({ mission: target });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen mission" }));
    expect(props.onReopen).toHaveBeenCalledWith(target);
  });

  it("locks completed missions of other members", () => {
    renderMissionCard({ mission: mission({ status: "completed", assignedMemberId: "other", assignedTo: "Other" }) });
    expect(screen.queryByText("—", { selector: ".no-row-action" })).not.toBeInTheDocument();
  });

  it("gives managers edit and delete actions", async () => {
    const target = mission({ title: "Op" });
    const { user, props } = renderMissionCard({
      canManage: true,
      currentMember: makeMember({ publicId: "me", role: "moderator", simpleView: false }),
      mission: target,
    });
    await user.click(screen.getByRole("button", { name: "Edit Op" }));
    await user.click(screen.getByRole("button", { name: "Delete Op" }));
    expect(props.onEdit).toHaveBeenCalledWith(target);
    expect(props.onDeleteMission).toHaveBeenCalledWith(target);
    expect(screen.queryByRole("button", { name: "Reopen mission" })).not.toBeInTheDocument();
  });

  it("lets a manager reopen their own completed mission besides editing", async () => {
    const target = assignedToMe({ status: "completed" });
    const { user, props } = renderMissionCard({
      canManage: true,
      currentMember: makeMember({ publicId: "me", role: "admin", simpleView: false }),
      mission: target,
    });
    await user.click(screen.getByRole("button", { name: "Reopen mission" }));
    expect(props.onReopen).toHaveBeenCalledWith(target);
    expect(screen.getByRole("button", { name: "Edit Survey Alpha" })).toBeInTheDocument();
  });

  it.each([
    ["builder", "Request Builder intervention"],
    ["ranger", "Request Ranger intervention"],
    ["explorer", "Request Explorer intervention"],
    ["explorer_builder", "Request Ranger intervention"],
  ] as const)("offers a %s request button", async (specialty, label) => {
    const target = mission();
    const { user, props } = renderMissionCard({
      canManage: true,
      mission: target,
      requestedSpecialty: () => specialty,
    });
    await user.click(screen.getByRole("button", { name: label }));
    expect(props.onCreateRangerMission).toHaveBeenCalledWith(target);
  });

  it("keeps the request button on a locked completed mission of the assignee", () => {
    renderMissionCard({ mission: assignedToMe({ status: "completed" }), requestedSpecialty: () => "ranger" });
    expect(screen.getByRole("button", { name: "Request Ranger intervention" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen mission" })).toBeInTheDocument();
  });
});

describe("MissionCard station link", () => {
  it.each([false, true])(
    "opens mission details without changing the planet title action, simple view %s",
    async (simpleView) => {
      const selected = mission();
      const { user, props, unmount } = renderMissionCard({
        mission: selected,
        currentMember: makeMember({ ...me(), simpleView }),
      });
      expect(screen.getByRole("link", { name: "Open mission details" })).toHaveAttribute(
        "href",
        `/missions/${selected.id}?from=missions`,
      );
      expect(screen.getByRole("link", { name: "Open mission details" })).toHaveAttribute(
        "data-tooltip",
        "Open mission details",
      );
      expect(screen.getByRole("link", { name: "Open mission details" }).nextElementSibling).toBe(
        screen.getByRole("button", { name: "Claim" }),
      );
      await user.click(screen.getByRole("button", { name: `Open system details for ${selected.title}` }));
      expect(props.onOpenPlanet).toHaveBeenCalledWith(selected);
      unmount();
      renderMissionCard({ hideDetailLink: true, currentMember: makeMember({ ...me(), simpleView }) });
      expect(screen.queryByRole("link", { name: "Open mission details" })).not.toBeInTheDocument();
    },
  );
  const manager = () => makeMember({ publicId: "me", role: "moderator", simpleView: false });

  it("links to the existing station for managers", () => {
    renderMissionCard({
      canManage: true,
      currentMember: manager(),
      mission: mission({ systemAddress: "0123456789ab", galaxy: 0 }),
      stationOwners: [{ portal: "0123456789AB", galaxy: 0, ownerId: "owner-1", ownerName: "Owner" }],
    });
    expect(screen.getByRole("link", { name: "Open linked station" })).toHaveAttribute(
      "href",
      "/stations/owner-1%3A0123456789AB%3A0?from=missions",
    );
  });

  it("offers to create the station, carrying the discoverer", () => {
    renderMissionCard({
      canManage: true,
      currentMember: manager(),
      mission: mission({ galaxy: 3, stationOwnerMemberId: "owner-1" }),
      stationOwners: [{ portal: "0123456789AB", galaxy: 0 } as never],
    });
    expect(screen.getByRole("link", { name: "Create a station for this mission" })).toHaveAttribute(
      "href",
      "/stations?createStation=1&portal=0123456789AB&galaxy=3&ownerId=owner-1",
    );
  });

  it("omits the owner when the mission has no discoverer", () => {
    renderMissionCard({ canManage: true, currentMember: manager() });
    expect(screen.getByRole("link", { name: "Create a station for this mission" })).toHaveAttribute(
      "href",
      "/stations?createStation=1&portal=0123456789AB&galaxy=0",
    );
  });

  it("hides the link until owners load and for non-managers", () => {
    const { unmount } = renderMissionCard({ canManage: true, currentMember: manager(), stationOwnersLoaded: false });
    expect(screen.queryByRole("link", { name: "Open linked station" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create station from mission" })).not.toBeInTheDocument();
    unmount();
    renderMissionCard();
    expect(screen.queryByRole("link", { name: "Open linked station" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create station from mission" })).not.toBeInTheDocument();
  });
});

describe("MissionCard people", () => {
  it("opens the assignee profile with the mission as context", async () => {
    const other: AllianceMember = makeMember({ publicId: "vega", image: "https://example.com/vega.png" });
    const target = mission({ assignedMemberId: "vega", assignedTo: "Vega", status: "in_progress" });
    const { user, props, container } = renderMissionCard({ mission: target, members: [other] });
    expect(container.querySelector(".assignee-avatar-image img")).toHaveAttribute(
      "src",
      "https://example.com/vega.png",
    );
    await user.click(screen.getByRole("button", { name: "Vega" }));
    expect(props.onOpenProfile).toHaveBeenCalledWith("vega", {
      type: "mission",
      missionCode: target.id,
      subjectLabel: target.title,
    });
  });

  it("uses the viewer's own image when assigned to them", () => {
    const { container } = renderMissionCard({
      currentMember: makeMember({ publicId: "me", image: "https://example.com/me.png", simpleView: false }),
      mission: assignedToMe(),
    });
    expect(container.querySelector(".assignee-avatar-image img")).toHaveAttribute("src", "https://example.com/me.png");
  });

  it("falls back to initials when an avatar fails to load", () => {
    const { container } = renderMissionCard({
      members: [makeMember({ publicId: "vega", image: "https://example.com/broken.png" })],
      mission: mission({ assignedMemberId: "vega", assignedTo: "Vega", status: "in_progress" }),
    });
    const image = container.querySelector(".assignee-avatar img");
    expect(image).not.toBeNull();
    fireEvent.error(image as Element);
    expect(screen.getByRole("button", { name: "Vega" })).toHaveTextContent("VEVega");
  });

  it("opens the discoverer profile with the planet as context", async () => {
    const target = mission({ stationOwnerMemberId: "disc", stationOwnerName: "Discoverer", galaxy: 2 });
    const getDiscovererImage = vi.fn(() => "https://example.com/d.png");
    const { user, props } = renderMissionCard({ mission: target, getDiscovererImage });
    expect(getDiscovererImage).toHaveBeenCalledWith("disc");
    await user.click(screen.getByRole("button", { name: "Discoverer" }));
    expect(props.onOpenProfile).toHaveBeenCalledWith("disc", {
      type: "planet",
      portal: target.systemAddress,
      galaxy: 2,
      subjectLabel: "",
    });
  });

  it("shows an unspecified discoverer as plain text", () => {
    renderMissionCard();
    expect(screen.getByText("Not specified")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not specified" })).not.toBeInTheDocument();
  });
});

describe("MissionCard progress", () => {
  it("shows no progress bar for missions without a single specialty", () => {
    renderMissionCard({ mission: mission({ targetSpecialty: "all", progress: 50 }) });
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });

  it("shows read-only progress, using the system floor when none was reported", () => {
    const { unmount } = renderMissionCard({ mission: mission({ progress: 40 }) });
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    unmount();
    renderMissionCard({ mission: mission({ progress: 0 }), systemStatuses: { "0:0123456789AB": ["mapped"] } });
    expect(screen.getByText("27%")).toBeInTheDocument();
  });

  it("lets the assignee report progress, never below the completed tasks", async () => {
    const target = assignedToMe({ progress: 10 });
    const { props } = renderMissionCard({ mission: target, systemStatuses: { "0:0123456789AB": ["mapped"] } });
    const slider = screen.getByRole("slider", { name: "Progress for Survey Alpha" });

    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.keyUp(slider);
    expect(props.onUpdateProgress).toHaveBeenCalledWith(target, 60);
    expect(screen.getByText("60%")).toBeInTheDocument();

    fireEvent.blur(slider);
    expect(props.onUpdateProgress).toHaveBeenCalledTimes(1);

    fireEvent.change(slider, { target: { value: "5" } });
    fireEvent.pointerUp(slider);
    expect(props.onUpdateProgress).toHaveBeenLastCalledWith(target, 27);
  });

  it("reverts the slider when saving progress fails", async () => {
    const onUpdateProgress = vi.fn(async () => {
      throw new Error("nope");
    });
    renderMissionCard({ mission: assignedToMe({ progress: 10 }), onUpdateProgress });
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "70" } });
    fireEvent.keyUp(slider);
    await waitFor(() => expect(screen.getByText("10%")).toBeInTheDocument());
  });

  it("resets the draft when the saved progress changes", () => {
    const target = assignedToMe({ progress: 10 });
    const { props, rerender } = renderMissionCard({ mission: target });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } });
    rerender(<MissionCard {...props} mission={{ ...target, progress: 30 }} />);
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("does not let managers drag progress", () => {
    renderMissionCard({ canManage: true, mission: assignedToMe({ progress: 10 }) });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("lets the assignee tick their specialty's system tasks", async () => {
    const target = assignedToMe();
    const { user, props } = renderMissionCard({ mission: target });
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "Mapped" }));
    expect(props.onToggleSystemStatus).toHaveBeenCalledWith(target, "mapped", true);
  });

  it("keeps system tasks read-only on pending missions", () => {
    renderMissionCard({ mission: assignedToMe({ status: "pending" }) });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("MissionCard notes", () => {
  it("shows mission notes to managers", async () => {
    const target = mission({ notes: "Bring fuel" });
    const { user, props } = renderMissionCard({ canManage: true, mission: target });
    await user.click(screen.getByRole("button", { name: "View notes for Survey Alpha" }));
    expect(props.onViewNotes).toHaveBeenCalledWith(target);
  });

  it("shows mission notes to the assignee but not to others", () => {
    const { unmount } = renderMissionCard({ mission: assignedToMe({ notes: "x" }) });
    expect(screen.getByRole("button", { name: "View notes for Survey Alpha" })).toBeInTheDocument();
    unmount();
    renderMissionCard({ mission: mission({ notes: "x" }) });
    expect(screen.queryByRole("button", { name: /View notes/ })).not.toBeInTheDocument();
  });

  it("hides the notes button for blank notes", () => {
    renderMissionCard({ canManage: true, mission: mission({ notes: "  " }) });
    expect(screen.queryByRole("button", { name: /View notes/ })).not.toBeInTheDocument();
  });

  it("shows the discoverer's planet notes when there are some", async () => {
    stubFetch({ notes: () => new Response(JSON.stringify({ note: "  Watch the sentinels  " })) });
    const target = mission();
    const { user, props } = renderMissionCard({ mission: target });
    const button = await screen.findByRole("button", { name: "View station notes for Survey Alpha" });
    await user.click(button);
    await waitFor(() =>
      expect(props.onViewPlanetNotes).toHaveBeenCalledWith({
        title: "Survey Alpha",
        portal: "0123456789AB",
        notes: ["Watch the sentinels"],
      }),
    );
  });

  it("hides planet notes when the request fails", async () => {
    const fetchMock = stubFetch({ notes: () => new Response(JSON.stringify({ error: "denied" }), { status: 403 }) });
    renderMissionCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /View station notes/ })).not.toBeInTheDocument();
  });
});

describe("readPlanetNotes", () => {
  it("caches notes and shares in-flight requests", async () => {
    const fetchMock = stubFetch({ notes: () => new Response(JSON.stringify({ note: "n" })) });
    const target = mission();
    const [first, second] = await Promise.all([readPlanetNotes(target), readPlanetNotes(target)]);
    expect(first).toEqual(["n"]);
    expect(second).toEqual(["n"]);
    expect(await readPlanetNotes(target)).toEqual(["n"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/missions/${target.id}/planet-notes`, { cache: "no-store" });
  });

  it("rejects with the API error and retries afterwards", async () => {
    stubFetch({ notes: () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const target = mission();
    await expect(readPlanetNotes(target)).rejects.toThrow("Forbidden");
    stubFetch({ notes: () => new Response(JSON.stringify({}), { status: 500 }) });
    await expect(readPlanetNotes(target)).rejects.toThrow("Unable to read planet notes.");
  });
});

describe("MissionCard planet thumbnail", () => {
  it("loads the Almanac disc image for the extended card", async () => {
    const fetchMock = stubFetch({
      planet: () => new Response(JSON.stringify({ planet: { pictures: { disc: "/planets/abc.png" } } })),
    });
    const { container } = renderMissionCard({ mission: mission({ galaxy: 4 }) });
    await waitFor(() =>
      expect(container.querySelector(".mission-card-planet-thumb img")).toHaveAttribute(
        "src",
        "https://nmsalmanac.com/api/planets/abc.png",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/planet?address=0123456789AB&galaxy=4",
      expect.objectContaining({ cache: "no-store" }),
    );

    fireEvent.error(container.querySelector(".mission-card-planet-thumb img") as Element);
    expect(container.querySelector(".mission-card-planet-fallback")).not.toBeNull();
  });

  it("ignores pictures outside the Almanac planets path", async () => {
    const fetchMock = stubFetch({
      planet: () => new Response(JSON.stringify({ planet: { pictures: { disc: "https://evil.example/x.png" } } })),
    });
    const { container } = renderMissionCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector(".mission-card-planet-thumb img")).toBeNull();
  });

  it("keeps the fallback silently when the thumbnail lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = stubFetch({ planet: () => new Response("{}", { status: 500 }) });
    const { container } = renderMissionCard({ mission: mission({ status: "completed" }) });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/missions/planet?"))).toBe(true),
    );
    expect(container.querySelector(".mission-card-planet-thumb img")).toBeNull();
    expect(container.querySelector(".mission-card-planet-fallback")).toHaveClass("mission-card-planet-thumb-done");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("skips the lookup for invalid addresses", async () => {
    const fetchMock = stubFetch();
    renderMissionCard({ mission: mission({ systemAddress: "XYZ" }) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/missions/planet?"))).toBe(false);
  });
});

describe.each([
  ["extended", false],
  ["simple", true],
])("MissionCard (%s) with legacy data", (_variant, simpleView) => {
  it("falls back to Euclid and all specialties for missions missing those fields", async () => {
    const fetchMock = stubFetch();
    const legacy = assignedToMe({
      galaxy: undefined as unknown as number,
      targetSpecialty: undefined as unknown as Mission["targetSpecialty"],
    });
    const { container } = renderMissionCard({
      currentMember: makeMember({ publicId: "me", specialty: undefined, simpleView }),
      mission: legacy,
    });
    expect(screen.getByText("Euclide")).not.toHaveClass("mission-galaxy-alert");
    expect(container.querySelector(".badge--specialty-all")).toHaveTextContent("All");
    expect(container.querySelector(".mission-card-planet-fallback")).not.toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/missions/planet?"))).toBe(false);
  });
});

describe("MissionCard (simple) system tasks", () => {
  it("lets the assignee tick their specialty's system tasks", async () => {
    const target = assignedToMe();
    const { user, props } = renderMissionCard({
      currentMember: makeMember({ publicId: "me", specialty: "explorer", role: "user", simpleView: true }),
      mission: target,
    });
    await user.click(screen.getByRole("checkbox", { name: "Mapped" }));
    expect(props.onToggleSystemStatus).toHaveBeenCalledWith(target, "mapped", true);
  });
});

describe("MissionCard planet notes edge cases", () => {
  it("ignores a failed lookup that resolves after the card unmounts", async () => {
    let reject: (error: Error) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/planet-notes")
          ? new Promise<Response>((_resolve, rejectFetch) => {
              reject = rejectFetch;
            })
          : Promise.resolve(new Response("{}", { status: 404 })),
      ),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = mission();
    const { unmount } = renderMissionCard({ mission: target });
    await waitFor(() => expect(planetNotesRequests.has(target.id)).toBe(true));
    unmount();
    reject(new Error("offline"));
    await waitFor(() => expect(planetNotesRequests.has(target.id)).toBe(false));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does nothing when re-reading expired notes fails on click", async () => {
    stubFetch({ notes: () => new Response(JSON.stringify({ note: "Beware" })) });
    const target = mission();
    const { user, props } = renderMissionCard({ mission: target });
    const button = await screen.findByRole("button", { name: `View station notes for ${target.title}` });
    const now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    const fetchMock = stubFetch({ notes: () => new Response(JSON.stringify({ error: "gone" }), { status: 500 }) });
    await user.click(button);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/missions/${target.id}/planet-notes`, expect.anything()),
    );
    await waitFor(() => expect(planetNotesRequests.has(target.id)).toBe(false));
    expect(props.onViewPlanetNotes).not.toHaveBeenCalled();
    dateNow.mockRestore();
  });
});

describe("readPlanetNotes with a superseded request", () => {
  it.each([
    ["resolves", () => new Response(JSON.stringify({ note: "n" }))],
    ["fails", () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })],
  ])("keeps a newer in-flight request when the old one %s", async (_label, notes) => {
    stubFetch({ notes });
    const target = mission();
    const stale = readPlanetNotes(target);
    const newer = Promise.resolve(["newer"]);
    planetNotesRequests.set(target.id, newer);
    await stale.catch(() => undefined);
    expect(planetNotesRequests.get(target.id)).toBe(newer);
    planetNotesRequests.delete(target.id);
  });
});

describe("MemberAvatar", () => {
  it("shows a dash when the label is empty", () => {
    const { container } = renderWithLocale(<MemberAvatar label="" />);
    expect(container.querySelector(".assignee-avatar")).toHaveTextContent("—");
  });
});

describe("MissionCard planet thumbnail edge cases", () => {
  it("keeps the fallback when the planet payload is not an object", async () => {
    const fetchMock = stubFetch({ planet: () => new Response(JSON.stringify({ planet: ["x"] })) });
    const { container } = renderMissionCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector(".mission-card-planet-thumb img")).toBeNull();
    expect(container.querySelector(".mission-card-planet-fallback")).not.toBeNull();
  });

  it("keeps the fallback when the lookup request throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/planet-notes")) return new Response(JSON.stringify({ note: "" }));
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderMissionCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector(".mission-card-planet-fallback")).not.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
