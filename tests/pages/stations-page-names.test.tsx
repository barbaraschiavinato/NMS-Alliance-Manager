// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationsPage } from "@/components/pages/stations-page";
import { generateSystemName } from "@/lib/system-name";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);
vi.mock("@/lib/system-name", () => ({ generateSystemName: vi.fn() }));

// Station name generation with a controllable generateSystemName: names typed while it runs win.

const ranger = makeMember({
  publicId: "ranger-1",
  nmsName: "Ranger One",
  specialty: "ranger",
  role: "user",
  simpleView: false,
});
const moderator = makeMember({ publicId: "mod-1", nmsName: "Mod", role: "moderator", simpleView: false });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderStations(member = ranger, props: Partial<Parameters<typeof StationsPage>[0]> = {}) {
  return renderPage(
    <StationsPage
      alliance={defaultAlliance}
      currentMember={member}
      missionCount={0}
      sidebarStationCount={0}
      {...props}
    />,
  );
}

function routes(overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/stations": { stations: [] },
    "GET /api/planet-status": { planets: {} },
    "/api/members": [ranger, moderator],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(generateSystemName).mockReset();
});

describe("StationsPage station names", () => {
  it("keeps a name typed while the name for a station from a mission is generated", async () => {
    const name = deferred<string | null>();
    vi.mocked(generateSystemName).mockReturnValue(name.promise);
    mockFetch(routes());
    const { user } = renderStations(moderator, {
      initialCreateStation: { portal: "1234567890AB", galaxy: 0, ownerId: "mod-1" },
    });

    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    const input = within(dialog).getByRole("textbox", { name: t("stations.station_name") });
    await user.type(input, "My Name");
    await act(async () => name.resolve("Zeta"));

    expect(input).toHaveValue("My Name");
    expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 0);
  });

  it("leaves the name empty when no name can be generated for a station from a mission", async () => {
    const name = deferred<string | null>();
    vi.mocked(generateSystemName).mockReturnValue(name.promise);
    mockFetch(routes());
    renderStations(moderator, { initialCreateStation: { portal: "1234567890AB", galaxy: 0, ownerId: "mod-1" } });

    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    await act(async () => name.resolve(null));
    expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 0);
    expect(within(dialog).getByRole("textbox", { name: t("stations.station_name") })).toHaveValue("");
  });

  it("keeps a name typed while the portal is being verified", async () => {
    const verify = deferred<unknown>();
    const name = deferred<string | null>();
    vi.mocked(generateSystemName).mockReturnValue(name.promise);
    const { requests } = mockFetch(
      routes({ "/api/missions/verify-system": () => verify.promise, "POST /api/stations": { stations: [] } }),
    );
    const { user } = renderStations();

    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await waitFor(() => expect(requests("GET", "/api/missions/verify-system")).toHaveLength(1), { timeout: 2000 });
    const input = within(dialog).getByRole("textbox", { name: t("stations.station_name") });
    await user.type(input, "Typed");
    await act(async () => verify.resolve({ found: true, planetType: "Lush" }));
    await act(async () => name.resolve("Zeta"));

    expect(input).toHaveValue("Typed");
    expect(input).toHaveAttribute("placeholder", "Lush");
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    await waitFor(() => expect(requests("POST", "/api/stations")).toHaveLength(1));
    expect(requests("POST", "/api/stations")[0].body).toMatchObject({ name: "Typed" });
  });

  it("uses the planet type when no system name can be generated", async () => {
    vi.mocked(generateSystemName).mockResolvedValue(null);
    mockFetch(routes({ "/api/missions/verify-system": { found: true, planetType: " Lush " } }));
    const { user } = renderStations();

    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    expect(within(dialog).getByRole("textbox", { name: t("stations.station_name") })).toHaveValue("Lush");
  });
});
