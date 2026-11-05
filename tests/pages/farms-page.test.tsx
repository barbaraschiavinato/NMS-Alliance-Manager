// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FarmsPage } from "@/components/pages/farms-page";
import type { FarmEntry } from "@/components/cards/farm-card";
import type { AllianceMember } from "@/lib/members/member-types";
import type { FarmStationName } from "@/lib/farms/farms";
import { generateSystemName } from "@/lib/planets/system-name";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, router, t } from "./helpers";
import type { FarmDetail } from "@/components/pages/farms-page";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/planets/system-name", () => ({ generateSystemName: vi.fn() }));
vi.mock("@/components/pages/stations-page", () => ({
  StationsPage: ({ detail }: { detail: { featuredPlanet?: { planetPortal: string } } }) => (
    <div data-testid="embedded-station">{detail.featuredPlanet?.planetPortal}</div>
  ),
}));
vi.mock("@/components/pages/planets-page", () => ({
  PlanetsPage: ({ featuredPlanet }: { featuredPlanet: { planetPortal: string } }) => (
    <div data-testid="embedded-planet">{featuredPlanet.planetPortal}</div>
  ),
}));

const user = makeMember({ publicId: "u1", email: "user@example.com", nmsName: "Farmer" });
const other = makeMember({ publicId: "u2", email: "other@example.com", nmsName: "Neighbour" });
const moderator = makeMember({
  publicId: "mod",
  email: "mod@example.com",
  nmsName: "Mod",
  role: "moderator",
  simpleView: false,
});

function farm(overrides: Partial<FarmEntry> = {}): FarmEntry {
  return {
    id: "farm-1",
    name: "Copper hill",
    portal: "0123456789AB",
    galaxy: 0,
    planetName: "Ruba",
    resources: ["Copper", "Frost Crystal"],
    ownerId: user.publicId,
    ownerName: "Farmer",
    ownerMemberId: user.publicId,
    createdAt: "2026-05-01T12:00:00.000Z",
    canManage: true,
    ...overrides,
  };
}

function renderFarms(
  member: AllianceMember = user,
  stationNames: readonly FarmStationName[] = [],
  locale: "en" | "it" = "en",
) {
  return renderPage(
    <FarmsPage
      alliance={defaultAlliance}
      currentMember={member}
      missionCount={0}
      stationCount={0}
      stationNames={stationNames}
    />,
    { locale },
  );
}

function renderDetail(detail: FarmDetail, member: AllianceMember = user) {
  return renderPage(
    <FarmsPage
      alliance={defaultAlliance}
      currentMember={member}
      detail={detail}
      missionCount={0}
      stationCount={0}
      stationNames={[]}
    />,
  );
}

function planet(overrides: Partial<PlanetDestination> = {}): PlanetDestination {
  return {
    id: "0123456789AB:0",
    portal: "0123456789AB",
    planetPortal: "0123456789AB",
    planetNumber: 1,
    galaxy: 0,
    almanacSearchIndex: "",
    almanacFacts: [],
    systemFacts: [],
    plants: [],
    minerals: [],
    valuables: [],
    dissonant: false,
    paradise: false,
    blackMarket: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(generateSystemName).mockReset();
  vi.mocked(generateSystemName).mockResolvedValue("Generated system");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FarmsPage", () => {
  it("shows the empty state and load errors through a toast", async () => {
    mockFetch({ "GET /api/farms": json({ error: "farms.error_unable_to_read" }, 503) });
    renderFarms();
    expect(await screen.findByText(t("farms.error_unable_to_read"))).toBeInTheDocument();
    expect(screen.getByText(t("farms.no_farms"))).toBeInTheDocument();
  });

  it("renders farm cards with resources, optional fields and actions only when manageable", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [
          farm({
            systemName: "Yestara",
            coordinates: "+1.5, -2.5",
            note: "Bring a suit",
            planetImageUrl: "https://example.com/p.jpg",
          }),
          farm({ id: "farm-2", name: "Frosty", ownerId: other.publicId, ownerName: "", canManage: false }),
        ],
      },
    });
    renderFarms();

    expect(await screen.findByText("Copper hill")).toBeInTheDocument();
    expect(screen.getAllByRole("list", { name: t("farms.materials") })[0]).toHaveTextContent("Copper");
    expect(screen.getAllByRole("list", { name: t("farms.plants") })[0]).toHaveTextContent("Frost Crystal");
    expect(screen.getByText("+1.5, -2.5")).toBeInTheDocument();
    expect(screen.getByText("System: Yestara")).toBeInTheDocument();
    expect(screen.getByText("Bring a suit")).toBeInTheDocument();
    expect(screen.getByText(t("farms.former_member"))).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("farms.edit_farm_named", { farm: "Frosty" }) })).toBeNull();
    expect(screen.queryByRole("button", { name: t("farms.delete_farm_named", { farm: "Frosty" }) })).toBeNull();
  });

  it("shows harvested products instead of plant names on farm cards", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [farm({ resources: ["Star Bramble", "Mordite"] })],
      },
    });
    renderFarms(user, [], "it");
    await screen.findByText("Copper hill");

    const plants = screen.getByRole("list", { name: t("farms.plants", undefined, "it") });
    expect(within(plants).getByText("Bulbo stellare")).toBeInTheDocument();
    expect(within(plants).getByText("Mordite")).toBeInTheDocument();
    expect(within(plants).queryByText("Rovo stellare")).toBeNull();
    expect(within(plants).queryByText("Radice di mordite")).toBeNull();
  });

  it("filters by tab and by search, including translated resources", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [
          farm(),
          farm({ id: "farm-2", name: "Frosty", resources: ["Sodium"], ownerId: other.publicId, canManage: false }),
        ],
      },
    });
    const { user: actor } = renderFarms();
    await screen.findByText("Frosty");

    await actor.click(screen.getByRole("tab", { name: new RegExp(t("farms.my_farms")) }));
    expect(screen.queryByText("Frosty")).toBeNull();
    await actor.click(screen.getByRole("tab", { name: new RegExp(t("farms.filter_all")) }));
    await actor.type(screen.getByRole("textbox", { name: t("farms.search_farms") }), "sodium");
    expect(screen.getByText("Frosty")).toBeInTheDocument();
    expect(screen.queryByText("Copper hill")).toBeNull();
    await actor.clear(screen.getByRole("textbox", { name: t("farms.search_farms") }));
    await actor.type(screen.getByRole("textbox", { name: t("farms.search_farms") }), "nothing here");
    expect(screen.getByText(t("farms.no_farms_found"))).toBeInTheDocument();
  });

  it("finds farms by the plant or its product in English and Italian", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [
          farm({ resources: ["Star Bramble"] }),
          farm({ id: "farm-2", name: "Other farm", resources: ["Sodium"] }),
        ],
      },
    });
    renderFarms(user, [], "it");
    await screen.findByText("Copper hill");
    const search = screen.getByRole("textbox", { name: t("farms.search_farms", undefined, "it") });
    for (const value of ["Star Bulb", "Bulbo stellare", "Star Bramble", "Rovo stellare"]) {
      fireEvent.change(search, { target: { value } });
      expect(screen.getByText("Copper hill")).toBeInTheDocument();
      expect(screen.queryByText("Other farm")).toBeNull();
    }
  });

  it("searches the farm picker by plant and product and saves the original resource IDs", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: true, planetType: "Lush", planetName: "Ruba Prime" },
      "POST /api/farms": { farms: [farm({ name: "Farm" })] },
    });
    const { user: actor } = renderFarms(user, [], "it");
    await screen.findByText(t("farms.no_farms", undefined, "it"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm", undefined, "it") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm", undefined, "it") });
    const search = within(dialog).getByRole("textbox", { name: t("farms.search_resources", undefined, "it") });

    for (const term of ["Bulbo stellare", "Star Bulb", "Rovo stellare", "Star Bramble"]) {
      fireEvent.change(search, { target: { value: term } });
      expect(within(dialog).getByRole("checkbox", { name: "Bulbo stellare" })).toBeInTheDocument();
    }
    await actor.click(within(dialog).getByRole("checkbox", { name: "Bulbo stellare" }));
    fireEvent.change(search, { target: { value: "Fiore di malviscere" } });
    await actor.click(within(dialog).getByRole("checkbox", { name: "Faecium" }));
    fireEvent.change(search, { target: { value: "Faecium" } });
    expect(within(dialog).getByRole("checkbox", { name: "Faecium" })).toBeChecked();
    fireEvent.change(search, { target: { value: "Cristallo gelido" } });
    await actor.click(within(dialog).getByRole("checkbox", { name: "Cristallo gelido" }));
    fireEvent.change(search, { target: { value: "Mordite" } });
    await actor.click(within(dialog).getByRole("checkbox", { name: "Mordite" }));
    expect(requests("GET", "/api/missions/verify-system")).toHaveLength(0);

    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name", undefined, "it") }), "Farm");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address", undefined, "it") }),
      "1234567890AB",
    );
    await waitFor(
      () =>
        expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name", undefined, "it") })).toHaveValue(
          "Ruba Prime",
        ),
      { timeout: 2000 },
    );
    await actor.click(within(dialog).getByRole("button", { name: t("common.add", undefined, "it") }));
    await waitFor(() => expect(requests("POST", "/api/farms")).toHaveLength(1));
    expect(requests("POST", "/api/farms")[0].body).toMatchObject({
      resources: ["Star Bramble", "Faecium", "Frost Crystal", "Mordite"],
    });
  });

  it("offers only cultivable plants and materials from extractors on a new farm", async () => {
    mockFetch({ "GET /api/farms": { farms: [] } });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    const plants = within(dialog).getByText(t("farms.plants")).parentElement;
    if (!plants) throw new Error("Missing farm plant group");
    expect(within(plants).getAllByRole("checkbox")).toHaveLength(12);
    expect(within(plants).getByRole("checkbox", { name: "Mordite" })).toBeInTheDocument();
    expect(within(plants).queryByRole("checkbox", { name: "Marrow Bulb" })).toBeNull();
    expect(within(plants).queryByRole("checkbox", { name: "Kelp Sac" })).toBeNull();
    expect(within(plants).queryByRole("checkbox", { name: "Aloe Flesh" })).toBeNull();
    const materials = within(dialog).getByText(t("farms.materials")).parentElement;
    if (!materials) throw new Error("Missing farm material group");
    expect(within(materials).getAllByRole("checkbox")).toHaveLength(31);
    for (const resource of [
      "Activated Quartzite",
      "Basalt",
      "Crystallised Helium",
      "Lithium",
      "Methane",
      "Quartzite",
    ]) {
      expect(within(materials).getByRole("checkbox", { name: resource })).toBeInTheDocument();
    }
    for (const resource of ["Carbon", "Runaway Mould", "Storm Crystal", "Tritium", "Ancient Bones"]) {
      expect(within(materials).queryByRole("checkbox", { name: resource })).toBeNull();
    }
  });

  it("adds a farm with the planet name from the lookup, without an owner select for regular users", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: true, planetType: "Lush", planetName: "Ruba Prime" },
      "POST /api/farms": { farm: farm(), farms: [farm({ name: "New farm", planetName: "Ruba Prime" })] },
    });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));

    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    expect(within(dialog).queryByRole("combobox", { name: t("farms.owner") })).toBeNull();
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name") }), "New farm");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890ab",
    );
    const planetName = within(dialog).getByRole("textbox", { name: t("farms.planet_name") });
    await waitFor(() => expect(planetName).toHaveValue("Ruba Prime"), { timeout: 2000 });
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.search_resources") }), "copp");
    await actor.click(within(dialog).getByRole("checkbox", { name: "Copper" }));
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.coordinates") }), "+1, -2");
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));

    expect(await screen.findByText(t("farms.farm_added"))).toBeInTheDocument();
    expect(requests("POST", "/api/farms")[0].body).toEqual({
      name: "New farm",
      portal: "1234567890AB",
      galaxy: 0,
      systemName: "Generated system",
      planetName: "Ruba Prime",
      resources: ["Copper"],
      coordinates: "+1, -2",
      note: "",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("New farm")).toBeInTheDocument();
  });

  it("allows saving when the system is unknown to the Almanac and keeps a typed planet name", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: false },
      "POST /api/farms": { farm: farm(), farms: [farm()] },
    });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));

    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "My planet");
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name") }), "Farm");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await actor.click(within(dialog).getByRole("checkbox", { name: "Sodium" }));
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await actor.click(add);

    await screen.findByText(t("farms.farm_added"));
    expect(requests("POST", "/api/farms")[0].body).toMatchObject({ planetName: "My planet", resources: ["Sodium"] });
  });

  it("validates required fields and shows API errors inside the dialog", async () => {
    mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: false },
      "POST /api/farms": json({ error: "farms.error_unable_to_save" }, 503),
    });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name") }), "Farm");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "Planet");
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await actor.click(add);
    expect(within(dialog).getByText(t("farms.error_resources_required"))).toBeInTheDocument();

    await actor.click(within(dialog).getByRole("checkbox", { name: "Cobalt" }));
    await actor.click(add);
    expect(await within(dialog).findByText(t("farms.error_unable_to_save"))).toBeInTheDocument();
    await actor.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets staff choose the owner when editing and deletes after confirmation", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [farm()] },
      "GET /api/members": [moderator, user, other],
      "/api/missions/verify-system": { found: true, planetName: "Other name" },
      "PATCH /api/farms": { farm: farm(), farms: [farm({ ownerId: other.publicId, ownerName: "Neighbour" })] },
      "DELETE /api/farms": { farms: [] },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user: actor } = renderFarms(moderator);
    await screen.findByText("Copper hill");

    await actor.click(screen.getByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Ruba");
    const owner = within(dialog).getByRole("combobox", { name: t("farms.owner") });
    expect(owner).toHaveValue(user.publicId);
    expect(
      within(owner)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([t("farms.unassigned"), "Mod", "Farmer", "Neighbour"]);
    await actor.selectOptions(owner, other.publicId);
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));

    expect(await screen.findByText(t("farms.farm_updated"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/farms")[0].body).toMatchObject({
      id: "farm-1",
      ownerId: other.publicId,
      planetName: "Ruba",
    });

    const remove = screen.getByRole("button", { name: t("farms.delete_farm_named", { farm: "Copper hill" }) });
    await actor.click(remove);
    expect(requests("DELETE", "/api/farms")).toHaveLength(0);
    await actor.click(remove);
    expect(await screen.findByText(t("farms.farm_deleted"))).toBeInTheDocument();
    expect(requests("DELETE", "/api/farms")[0].body).toEqual({ id: "farm-1" });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("refills the planet name from the lookup when an edited farm's portal changes", async () => {
    mockFetch({
      "GET /api/farms": { farms: [farm()] },
      "/api/missions/verify-system": { found: true, planetName: "Fresh world" },
    });
    const { user: actor } = renderFarms();
    await screen.findByText("Copper hill");
    await actor.click(screen.getByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    const portal = within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") });
    await actor.clear(portal);
    await actor.type(portal, "1234567890AB");
    await waitFor(
      () => expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Fresh world"),
      { timeout: 2000 },
    );
  });

  it("reports delete failures through a toast", async () => {
    mockFetch({
      "GET /api/farms": { farms: [farm()] },
      "DELETE /api/farms": json({ error: "farms.error_unable_to_remove" }, 503),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user: actor } = renderFarms();
    await actor.click(
      await screen.findByRole("button", { name: t("farms.delete_farm_named", { farm: "Copper hill" }) }),
    );
    expect(await screen.findByText(t("farms.error_unable_to_remove"))).toBeInTheDocument();
    expect(screen.getByText("Copper hill")).toBeInTheDocument();
  });

  it("prefills a visible station name for the same system and permits overriding it when Almanac is unavailable", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": json({ error: "unavailable" }, 503),
      "POST /api/farms": { farm: farm(), farms: [farm({ systemName: "My system" })] },
    });
    const { user: actor } = renderFarms(user, [{ portal: "0234567890AB", galaxy: 0, name: "Ally station" }]);
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name") }), "Farm");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const systemName = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    await waitFor(() => expect(systemName).toHaveValue("Ally station"));
    expect(generateSystemName).not.toHaveBeenCalled();
    await actor.clear(systemName);
    await actor.type(systemName, "My system");
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "My planet");
    await actor.click(within(dialog).getByRole("checkbox", { name: "Copper" }));
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await actor.click(add);
    expect(await screen.findByText(t("farms.farm_added"))).toBeInTheDocument();
    expect(requests("POST", "/api/farms")[0].body).toMatchObject({ systemName: "My system" });
    expect(requests("GET", "/api/missions/verify-system")).toHaveLength(1);
  });

  it("uses nms-core when a station is in another galaxy or system", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: false },
    });
    const { user: actor } = renderFarms(user, [
      { portal: "0234567890AB", galaxy: 1, name: "Other galaxy" },
      { portal: "0234567890AC", galaxy: 0, name: "Other system" },
    ]);
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: t("farms.system_name") })).toHaveValue("Generated system"),
    );
    expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 0);
    await waitFor(() => expect(requests("GET", "/api/missions/verify-system")).toHaveLength(1), { timeout: 2000 });
  });

  it("generates the actual nms-core system name using only local letter-map shards", async () => {
    const actual = await vi.importActual<typeof import("@/lib/planets/system-name")>("@/lib/planets/system-name");
    vi.mocked(generateSystemName).mockImplementation(actual.generateSystemName);
    const publicDir = path.resolve(__dirname, "../../public/nms-core");
    const shardRoutes = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const file = `letter_map_${index}.json`;
        return [`/nms-core/${file}`, () => new Response(readFileSync(path.join(publicDir, file), "utf8"))];
      }),
    );
    const { calls, requests } = mockFetch({
      ...shardRoutes,
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: false },
    });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const input = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    await waitFor(() => expect(input).not.toHaveValue(""));
    const shardCalls = calls.filter((call) => call.url.pathname.startsWith("/nms-core/")).length;
    expect(shardCalls).toBeGreaterThan(0);
    const expected = await actual.generateSystemName("1234567890AB", 0);
    expect(input).toHaveValue(expected);
    expect(await actual.generateSystemName("2234567890AB", 0)).toBe(expected);
    expect(calls.filter((call) => call.url.pathname.startsWith("/nms-core/"))).toHaveLength(shardCalls);
    await waitFor(() => expect(requests("GET", "/api/missions/verify-system")).toHaveLength(1), { timeout: 2000 });
  });

  it("keeps a manually entered name when nms-core finishes later", async () => {
    const pending = deferred<string | null>();
    vi.mocked(generateSystemName).mockReturnValueOnce(pending.promise);
    mockFetch({ "GET /api/farms": { farms: [] }, "/api/missions/verify-system": { found: false } });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await waitFor(() => expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 0));
    const systemName = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    await actor.type(systemName, "Typed by me");
    await act(async () => pending.resolve("Late generated name"));
    expect(systemName).toHaveValue("Typed by me");
  });

  it("ignores an outdated system name when the address changes during generation", async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    vi.mocked(generateSystemName).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mockFetch({ "GET /api/farms": { farms: [] }, "/api/missions/verify-system": { found: false } });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    const portal = within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") });
    const systemName = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    await actor.type(portal, "1234567890AB");
    await waitFor(() => expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 0));
    await actor.clear(portal);
    await actor.type(portal, "1234567890AC");
    await waitFor(() => expect(generateSystemName).toHaveBeenCalledWith("1234567890AC", 0));
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("No planet registered"), {
      timeout: 2000,
    });
    expect(add).toBeDisabled();
    await act(async () => first.resolve("Old system"));
    expect(systemName).toHaveValue("");
    await act(async () => second.resolve("New system"));
    expect(systemName).toHaveValue("New system");
    await waitFor(() => expect(add).toBeEnabled());
  });

  it("recalculates the name after the galaxy changes and reports generation failures without blocking manual entry", async () => {
    vi.mocked(generateSystemName).mockResolvedValue(null);
    mockFetch({ "GET /api/farms": { farms: [] }, "/api/missions/verify-system": { found: false } });
    const { user: actor } = renderFarms(user, [{ portal: "0234567890AB", galaxy: 0, name: "Euclid station" }]);
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const systemName = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    await waitFor(() => expect(systemName).toHaveValue("Euclid station"));
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "1");
    expect(await within(dialog).findByText(t("farms.error_system_name_unavailable"))).toBeInTheDocument();
    expect(systemName).toHaveValue("");
    expect(generateSystemName).toHaveBeenCalledWith("1234567890AB", 1);
    await actor.type(systemName, "Manually added");
    expect(within(dialog).queryByText(t("farms.error_system_name_unavailable"))).toBeNull();
  });

  it("reports and logs an unexpected generator rejection while allowing the farm to be saved", async () => {
    const error = new Error("generator failed");
    vi.mocked(generateSystemName).mockRejectedValueOnce(error);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({ "GET /api/farms": { farms: [] }, "/api/missions/verify-system": { found: false } });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    expect(await within(dialog).findByText(t("farms.error_system_name_unavailable"))).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("Unable to generate farm system name", error);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: t("common.add") })).toBeEnabled(), {
      timeout: 2000,
    });
  });

  it("prefills a legacy farm without a system name from its matching station", async () => {
    mockFetch({ "GET /api/farms": { farms: [farm()] }, "/api/missions/verify-system": { found: false } });
    const { user: actor } = renderFarms(user, [{ portal: "1123456789AB", galaxy: 0, name: "Saved station" }]);
    await actor.click(await screen.findByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    expect(within(dialog).getByRole("textbox", { name: t("farms.system_name") })).toHaveValue("Saved station");
    expect(generateSystemName).not.toHaveBeenCalled();
  });

  it("preserves a saved system name on edit and allows clearing it", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [farm({ systemName: "Saved custom" })] },
      "/api/missions/verify-system": { found: false },
      "PATCH /api/farms": { farms: [farm()] },
    });
    const { user: actor } = renderFarms(user, [{ portal: "0234567890AB", galaxy: 0, name: "Ally station" }]);
    await actor.click(await screen.findByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    const systemName = within(dialog).getByRole("textbox", { name: t("farms.system_name") });
    expect(systemName).toHaveValue("Saved custom");
    await actor.clear(systemName);
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));
    await screen.findByText(t("farms.farm_updated"));
    expect(requests("PATCH", "/api/farms")[0].body).toMatchObject({ systemName: "" });
    expect(generateSystemName).not.toHaveBeenCalled();
  });

  it("searches the saved system name", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [farm({ systemName: "Alpha Centauri" }), farm({ id: "farm-2", name: "Other", systemName: "Beta" })],
      },
    });
    const { user: actor } = renderFarms();
    await screen.findByText("Other");
    await actor.type(screen.getByRole("textbox", { name: t("farms.search_farms") }), "centauri");
    expect(screen.getByText("Copper hill")).toBeInTheDocument();
    expect(screen.queryByText("Other")).toBeNull();
  });
  it("validates each required field, unchecks resources and resubmits after a galaxy change", async () => {
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [] },
      "/api/missions/verify-system": { found: false },
      "POST /api/farms": { farm: farm(), farms: [farm()] },
    });
    const { user: actor } = renderFarms();
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const dialog = screen.getByRole("dialog", { name: t("farms.add_farm") });
    const form = dialog.querySelector("form") as HTMLFormElement;

    fireEvent.submit(form);
    expect(within(dialog).getByText(t("farms.error_name_required"))).toBeInTheDocument();
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.farm_name") }), "Farm");
    fireEvent.submit(form);
    expect(within(dialog).getByText(t("farms.error_invalid_portal_and_galaxy"))).toBeInTheDocument();

    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    fireEvent.submit(form);
    expect(within(dialog).getByText(t("farms.error_planet_name_required"))).toBeInTheDocument();

    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "Planet");
    const cobalt = within(dialog).getByRole("checkbox", { name: "Cobalt" });
    await actor.click(cobalt);
    await actor.click(cobalt);
    expect(cobalt).not.toBeChecked();
    await actor.click(add);
    expect(within(dialog).getByText(t("farms.error_resources_required"))).toBeInTheDocument();

    await actor.click(cobalt);
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.notes") }), "Bring a suit");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "1");
    expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Planet");
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await actor.click(add);
    await screen.findByText(t("farms.farm_added"));
    expect(requests("POST", "/api/farms")[0].body).toMatchObject({
      galaxy: 1,
      planetName: "Planet",
      resources: ["Cobalt"],
      note: "Bring a suit",
    });
  });

  it("keeps a removed owner selectable for staff as a former member", async () => {
    mockFetch({
      "GET /api/farms": { farms: [farm({ ownerId: "gone", ownerName: "", ownerMemberId: undefined })] },
      "GET /api/members": [moderator, user, makeMember({ publicId: "anon", nmsName: "", name: "Aaron" })],
    });
    const { user: actor } = renderFarms(moderator);
    await actor.click(await screen.findByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const owner = within(screen.getByRole("dialog", { name: t("farms.edit_farm") })).getByRole("combobox", {
      name: t("farms.owner"),
    });
    await waitFor(() => expect(within(owner).getAllByRole("option")).toHaveLength(5));
    expect(owner).toHaveValue("gone");
    expect(
      within(owner)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([t("farms.unassigned"), t("farms.former_member"), "Mod", "Aaron", "Farmer"]);
  });

  it("survives unreadable responses and opens the admin and profile panels", async () => {
    const admin = makeMember({
      publicId: "admin",
      nmsName: "Chief",
      role: "admin",
      simpleView: false,
      pulseEffectsEnabled: false,
    });
    mockFetch({
      "GET /api/farms": new Response("not json", { status: 500 }),
      "GET /api/members": json({ error: "nope" }, 500),
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user: actor } = renderFarms(admin);
    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: t("common.close_notification") }));
    expect(screen.queryByText(t("errors.request_failed"))).toBeNull();

    await actor.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await actor.click(within(settings).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog", { name: t("admin.alliance") })).toBeNull();

    await actor.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    let profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await actor.click(within(profile).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog", { name: t("profile.my_nms_profile") })).toBeNull();
    await actor.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await actor.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });
  it("falls back to generic messages when requests fail without an error object", async () => {
    const reject = () => Promise.reject("offline");
    mockFetch({ "GET /api/farms": reject });
    const first = renderFarms();
    expect(await screen.findByText(t("farms.error_unable_to_read"))).toBeInTheDocument();
    first.unmount();

    mockFetch({
      "GET /api/farms": { farms: [farm()] },
      "/api/missions/verify-system": { found: false },
      "PATCH /api/farms": reject,
      "DELETE /api/farms": reject,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user: actor } = renderFarms();
    await actor.click(
      await screen.findByRole("button", { name: t("farms.delete_farm_named", { farm: "Copper hill" }) }),
    );
    expect(await screen.findByText(t("farms.error_unable_to_remove"))).toBeInTheDocument();

    await actor.click(screen.getByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));
    expect(await within(dialog).findByText(t("errors.save_failed"))).toBeInTheDocument();
  });

  it("shows and searches unassigned farms, and keeps them unassigned when staff save them", async () => {
    const free = farm({ ownerId: null, ownerName: "", note: "Bring a suit", coordinates: "+1, -2" });
    const { requests } = mockFetch({
      "GET /api/farms": { farms: [free, farm({ id: "farm-2", name: "Frosty" })] },
      "GET /api/members": [moderator, user],
      "/api/missions/verify-system": { found: false },
      "PATCH /api/farms": { farms: [free] },
    });
    const { user: actor } = renderFarms(moderator);
    await screen.findByText("Frosty");
    expect(screen.getByText(t("farms.unassigned"))).toBeInTheDocument();
    const search = screen.getByRole("textbox", { name: t("farms.search_farms") });
    await actor.type(search, t("farms.unassigned"));
    expect(screen.queryByText("Frosty")).toBeNull();
    expect(screen.getByText("Copper hill")).toBeInTheDocument();
    await actor.clear(search);
    await actor.type(search, "suit");
    expect(screen.queryByText("Frosty")).toBeNull();

    await actor.click(screen.getByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }));
    const dialog = screen.getByRole("dialog", { name: t("farms.edit_farm") });
    expect(within(dialog).getByRole("combobox", { name: t("farms.owner") })).toHaveValue("");
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));
    await waitFor(() => expect(requests("PATCH", "/api/farms")).toHaveLength(1));
    expect(requests("PATCH", "/api/farms")[0].body).toMatchObject({ id: "farm-1", ownerId: null });
  });

  it("sorts staff owner options by NMS name, falling back to the account name", async () => {
    mockFetch({
      "GET /api/farms": { farms: [] },
      "GET /api/members": [
        moderator,
        user,
        makeMember({ publicId: "u3", email: "a@example.com", nmsName: "", name: "Alpha" }),
      ],
    });
    const { user: actor } = renderFarms(moderator);
    await screen.findByText(t("farms.no_farms"));
    await actor.click(screen.getByRole("button", { name: t("farms.add_farm") }));
    const owner = within(screen.getByRole("dialog")).getByRole("combobox", { name: t("farms.owner") });
    await waitFor(() => expect(within(owner).getAllByRole("option")).toHaveLength(4));
    expect(
      within(owner)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([t("farms.unassigned"), "Mod", "Alpha", "Farmer"]);
  });

  it("ignores farm responses that arrive after the page is closed", async () => {
    const pending = deferred<Response>();
    const failing = deferred<Response>();
    mockFetch({ "GET /api/farms": () => pending.promise });
    const first = renderFarms();
    first.unmount();
    await act(async () => pending.resolve(json({ farms: [farm()] })));

    mockFetch({ "GET /api/farms": () => failing.promise });
    const second = renderFarms();
    second.unmount();
    await act(async () => failing.resolve(json({ error: "farms.error_unable_to_read" }, 503)));
    expect(screen.queryByText(t("farms.error_unable_to_read"))).toBeNull();
  });

  it("filters by plant and mineral with removable chips and a reset", async () => {
    mockFetch({
      "GET /api/farms": {
        farms: [
          farm(),
          farm({ id: "farm-2", name: "Gamma field", resources: ["Gamma Root"] }),
          farm({ id: "farm-3", name: "Sodium flats", resources: ["Sodium"] }),
        ],
      },
    });
    renderFarms();
    await screen.findByText("Copper hill");
    const toggle = screen.getByRole("button", { name: t("planet.filters") });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const plants = screen.getByRole("combobox", { name: t("planet.filter_plants") });
    const minerals = screen.getByRole("combobox", { name: t("planet.filter_minerals") });
    expect(
      within(plants)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["", "Frost Crystal", "Gamma Root"]);
    expect(within(plants).getByRole("option", { name: "Frostwort (Frost Crystal)" })).toHaveValue("Frost Crystal");
    expect(within(plants).getByRole("option", { name: "Gamma Weed (Gamma Root)" })).toHaveValue("Gamma Root");
    expect(
      within(minerals)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["", "Copper", "Sodium"]);

    fireEvent.change(plants, { target: { value: "Gamma Root" } });
    expect(screen.getByText("Gamma field")).toBeInTheDocument();
    expect(screen.queryByText("Copper hill")).toBeNull();
    expect(toggle).toHaveAttribute("data-active", "true");

    fireEvent.change(minerals, { target: { value: "Sodium" } });
    expect(screen.getByText(t("farms.no_farms_match_filters"))).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: t("farms.search_farms") }), { target: { value: "x" } });
    expect(screen.getByText(t("farms.no_farms_found"))).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: t("farms.search_farms") }), { target: { value: "" } });

    fireEvent.click(
      screen.getByRole("button", {
        name: `${t("planet.remove_filter")}: ${t("common.plants")}: Gamma Weed (Gamma Root)`,
      }),
    );
    expect(screen.getByText("Sodium flats")).toBeInTheDocument();
    expect(screen.queryByText("Gamma field")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t("planet.reset_filters") }));
    expect(screen.getByText("Copper hill")).toBeInTheDocument();
    expect(screen.getByText("Gamma field")).toBeInTheDocument();
    expect(toggle).not.toHaveAttribute("data-active");
    fireEvent.click(toggle);
    expect(screen.queryByRole("combobox", { name: t("planet.filter_plants") })).toBeNull();
  });

  describe("Excel export", () => {
    it.each(["moderator", "admin"] as const)("shows the export action to a %s", async (role) => {
      const staff = makeMember({ role, simpleView: false });
      mockFetch({ "GET /api/farms": { farms: [] }, "GET /api/members": [staff] });
      renderFarms(staff);

      await screen.findByText(t("farms.no_farms"));
      const button = screen.getByRole("button", { name: t("farms.export_to_excel") });
      expect(button).toBeEnabled();
      expect(button).toHaveClass("station-export-button");
      expect(button).toHaveAttribute("data-tooltip", t("farms.export_to_excel"));
      expect(button).toHaveAttribute("title", t("farms.export_to_excel"));
    });

    it.each([
      { description: "a regular member", member: user },
      {
        description: "an admin in simple view",
        member: makeMember({ role: "user", displayRole: "admin", simpleView: true }),
      },
      {
        description: "a moderator in simple view",
        member: makeMember({ role: "user", displayRole: "moderator", simpleView: true }),
      },
    ])("hides the action from $description", async ({ member }) => {
      mockFetch({ "GET /api/farms": { farms: [] } });
      renderFarms(member);

      await screen.findByText(t("farms.no_farms"));
      expect(screen.queryByRole("button", { name: t("farms.export_to_excel") })).toBeNull();
    });

    it("does not show the list export action in a farm detail, even for staff", async () => {
      mockFetch({ "GET /api/farms": { farms: [farm()] }, "GET /api/members": [moderator] });
      renderDetail({ id: "farm-1", origin: "farms" }, moderator);

      await screen.findByText("Copper hill");
      expect(screen.queryByRole("button", { name: t("farms.export_to_excel") })).toBeNull();
    });

    it("disables repeat requests while exporting and downloads the supplied filename", async () => {
      const pending = deferred<Response>();
      const createObjectURL = vi.fn(() => "blob:farm-export");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
      const downloads: { filename: string; href: string; attached: boolean }[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ filename: this.download, href: this.href, attached: document.body.contains(this) });
      });
      const { fetchMock, requests } = mockFetch({
        "GET /api/farms": {
          farms: [
            farm(),
            farm({ id: "farm-2", name: "Other farm", ownerId: other.publicId, ownerName: other.nmsName }),
          ],
        },
        "GET /api/members": [moderator],
        "GET /api/farms/export": () => pending.promise,
      });
      const { user: actor } = renderFarms(moderator, [], "it");
      await screen.findByText("Copper hill");
      await actor.click(screen.getByRole("tab", { name: new RegExp(t("farms.my_farms", undefined, "it")) }));
      expect(screen.queryByText("Copper hill")).toBeNull();

      const button = screen.getByRole("button", { name: "Esporta Excel" });
      await actor.click(button);
      const busy = screen.getByRole("button", { name: "Esportazione…" });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute("data-tooltip", "Esportazione…");
      await actor.click(busy);
      expect(requests("GET", "/api/farms/export")).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/farms/export", { cache: "no-store" });

      await act(async () => {
        pending.resolve(
          new Response("xlsx", {
            headers: {
              "Content-Disposition": 'attachment; filename="farm-2026-07-04.xlsx"',
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          }),
        );
      });
      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ size: 4, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      expect(downloads).toEqual([{ filename: "farm-2026-07-04.xlsx", href: "blob:farm-export", attached: true }]);
      expect(document.querySelector('a[download="farm-2026-07-04.xlsx"]')).toBeNull();
      expect(screen.getByRole("button", { name: "Esporta Excel" })).toBeEnabled();
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:farm-export"), { timeout: 2500 });
    });

    it("uses a dated fallback filename if the server omits Content-Disposition", async () => {
      const createObjectURL = vi.fn(() => "blob:fallback");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
      const filenames: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        filenames.push(this.download);
      });
      mockFetch({
        "GET /api/farms": { farms: [] },
        "GET /api/members": [moderator],
        "GET /api/farms/export": new Response("xlsx"),
      });
      const { user: actor } = renderFarms(moderator);
      await screen.findByText(t("farms.no_farms"));

      await actor.click(screen.getByRole("button", { name: t("farms.export_to_excel") }));
      await waitFor(() => expect(filenames).toHaveLength(1));
      expect(filenames[0]).toMatch(/^farm-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(screen.getByRole("button", { name: t("farms.export_to_excel") })).toBeEnabled();
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:fallback"), { timeout: 2500 });
    });

    it("shows translated server errors and handles unreadable, missing and rejected responses", async () => {
      const exportResponse = vi
        .fn()
        .mockReturnValueOnce(json({ error: "farms.error_moderator_permission_required" }, 403))
        .mockReturnValueOnce(new Response("not json", { status: 500 }))
        .mockReturnValueOnce(json({}, 503))
        .mockRejectedValueOnce(new Error("Connection failed"))
        .mockRejectedValueOnce("offline");
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      const { requests } = mockFetch({
        "GET /api/farms": { farms: [] },
        "GET /api/members": [moderator],
        "GET /api/farms/export": exportResponse,
      });
      const { user: actor } = renderFarms(moderator);
      await screen.findByText(t("farms.no_farms"));

      for (const message of [
        t("farms.error_moderator_permission_required"),
        t("farms.error_unable_to_export"),
        t("farms.error_unable_to_export"),
        "Connection failed",
        t("farms.error_unable_to_export"),
      ]) {
        await actor.click(screen.getByRole("button", { name: t("farms.export_to_excel") }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
        expect(screen.getByRole("button", { name: t("farms.export_to_excel") })).toBeEnabled();
        await actor.click(screen.getByRole("button", { name: t("common.close_notification") }));
      }

      expect(requests("GET", "/api/farms/export")).toHaveLength(5);
      expect(click).not.toHaveBeenCalled();
    });

    it("translates export errors in Italian", async () => {
      mockFetch({
        "GET /api/farms": { farms: [] },
        "GET /api/members": [moderator],
        "GET /api/farms/export": json({ error: "farms.error_unable_to_export" }, 503),
      });
      const { user: actor } = renderFarms(moderator, [], "it");
      await screen.findByText(t("farms.no_farms", undefined, "it"));

      await actor.click(screen.getByRole("button", { name: "Esporta Excel" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile esportare le farm.");
    });
  });

  describe("detail", () => {
    it("shows only the selected farm card with the embedded linked station and the unavailable notice", async () => {
      const { calls } = mockFetch({
        "GET /api/farms": { farms: [farm({ stationHref: "/stations/x" })] },
      });
      renderDetail({
        id: "farm-1",
        origin: "planets",
        planetDataUnavailable: true,
        stationDetail: {
          station: { portal: "1123456789AB", galaxy: 0, ownerId: user.publicId },
          system: { portal: "1123456789AB", galaxy: 0 },
          origin: "farms",
          planets: [],
          almanacLookupFailed: false,
          featuredPlanet: planet(),
        },
      });
      expect(await screen.findByText("Copper hill")).toBeInTheDocument();
      expect(calls.some((call) => call.url.searchParams.get("detailFarm") === "farm-1")).toBe(true);
      expect(screen.getByTestId("embedded-station")).toHaveTextContent("0123456789AB");
      expect(screen.getByRole("status")).toHaveTextContent(t("farms.planet_data_unavailable"));
      expect(screen.queryByTestId("embedded-planet")).toBeNull();
      expect(screen.queryByRole("button", { name: t("farms.add_farm") })).toBeNull();
      expect(screen.queryByRole("textbox", { name: t("farms.search_farms") })).toBeNull();
    });

    it("shows the cached planet without a station and ignores mismatched planet data", async () => {
      mockFetch({ "GET /api/farms": { farms: [farm()] } });
      const { unmount } = renderDetail({ id: "farm-1", origin: "farms", planet: planet() });
      expect(await screen.findByTestId("embedded-planet")).toHaveTextContent("0123456789AB");
      expect(screen.queryByTestId("embedded-station")).toBeNull();
      unmount();

      renderDetail({
        id: "farm-1",
        origin: "farms",
        planet: planet({ galaxy: 1 }),
        stationDetail: {
          station: { portal: "1123456789AB", galaxy: 0, ownerId: user.publicId },
          system: { portal: "1123456789AB", galaxy: 0 },
          origin: "farms",
          planets: [],
          almanacLookupFailed: false,
          featuredPlanet: planet({ planetPortal: "2123456789AB" }),
        },
      });
      expect(await screen.findByText("Copper hill")).toBeInTheDocument();
      expect(screen.queryByTestId("embedded-planet")).toBeNull();
      expect(screen.queryByTestId("embedded-station")).toBeNull();
    });

    it("shows every farm of the planet when opened from a planet card, the opened one first", async () => {
      const { calls } = mockFetch({
        "GET /api/farms": {
          farms: [
            farm({ id: "farm-old", name: "Older", createdAt: "2026-01-01T00:00:00.000Z" }),
            farm({ id: "farm-1", name: "Copper hill", createdAt: "2026-02-01T00:00:00.000Z" }),
            farm({ id: "farm-new", name: "Newest", createdAt: "2026-03-01T00:00:00.000Z" }),
            farm({ id: "farm-far", name: "Elsewhere", portal: "2123456789AB" }),
          ],
        },
      });
      renderDetail({ id: "farm-1", origin: "planets" });
      expect(await screen.findByText("Newest")).toBeInTheDocument();
      expect(calls.find((call) => call.url.searchParams.has("detailFarm"))?.url.searchParams.get("samePlanet")).toBe(
        "1",
      );
      expect([...document.querySelectorAll(".farm-card-title")].map((node) => node.textContent)).toEqual([
        "Copper hill",
        "Newest",
        "Older",
      ]);
      expect(screen.getByRole("region", { name: t("details.farms_on_planet") })).toBeInTheDocument();
      expect(screen.queryByText("Elsewhere")).toBeNull();
      expect(screen.queryByRole("link", { name: "Copper hill" })).toBeNull();
      expect(screen.getByRole("link", { name: "Newest" }).getAttribute("href")).toMatch(
        /^\/farms\/farm-new\?from=planets/,
      );
    });

    it("keeps a single farm when the detail is opened from anywhere else", async () => {
      const { calls } = mockFetch({
        "GET /api/farms": { farms: [farm(), farm({ id: "farm-2", name: "Sibling" })] },
      });
      renderDetail({ id: "farm-1", origin: "farms" });
      expect(await screen.findByText("Copper hill")).toBeInTheDocument();
      expect(calls.find((call) => call.url.searchParams.has("detailFarm"))?.url.searchParams.has("samePlanet")).toBe(
        false,
      );
      expect(screen.queryByText("Sibling")).toBeNull();
      expect(screen.getByRole("region", { name: t("details.farm") })).toBeInTheDocument();
    });

    it("reports a missing farm and refreshes the route after an edit", async () => {
      mockFetch({ "GET /api/farms": { farms: [] } });
      const { unmount } = renderDetail({ id: "farm-1", origin: "farms" });
      expect(await screen.findByText(t("farms.error_unable_to_read"))).toBeInTheDocument();
      unmount();

      router.refresh.mockClear();
      mockFetch({
        "GET /api/farms": { farms: [farm()] },
        "/api/missions/verify-system": { found: false },
        "PATCH /api/farms": { farms: [farm({ name: "Renamed" })] },
      });
      const { user: actor } = renderDetail({ id: "farm-1", origin: "farms" });
      await actor.click(
        await screen.findByRole("button", { name: t("farms.edit_farm_named", { farm: "Copper hill" }) }),
      );
      const save = within(screen.getByRole("dialog")).getByRole("button", { name: t("common.save") });
      await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
      await actor.click(save);
      expect(await screen.findByText("Renamed")).toBeInTheDocument();
      expect(router.refresh).toHaveBeenCalled();
    });

    it("returns to the origin after deleting the open farm", async () => {
      router.replace.mockClear();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const changed = vi.fn();
      window.addEventListener("farms-changed", changed);
      mockFetch({ "GET /api/farms": { farms: [farm()] }, "DELETE /api/farms": { farms: [] } });
      renderDetail({ id: "farm-1", origin: "planets" });
      fireEvent.click(
        await screen.findByRole("button", { name: t("farms.delete_farm_named", { farm: "Copper hill" }) }),
      );
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/planets"));
      expect(changed).toHaveBeenCalled();
      expect(screen.queryByText(t("farms.farm_deleted"))).toBeNull();
      window.removeEventListener("farms-changed", changed);
    });
  });
});
