// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetsPage } from "@/components/pages/pets-page";
import type { PetEntry } from "@/components/cards/pet-card";
import type { AllianceMember } from "@/lib/members/member-types";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, router, t } from "./helpers";
import type { PetDetail } from "@/components/pages/pets-page";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/components/pages/stations-page", () => ({
  StationsPage: ({
    detail,
    embeddedOrigin,
  }: {
    detail: { featuredPlanet?: { planetPortal: string } };
    embeddedOrigin?: string;
  }) => (
    <div data-origin={embeddedOrigin} data-testid="embedded-station">
      {detail.featuredPlanet?.planetPortal}
    </div>
  ),
}));
vi.mock("@/components/pages/planets-page", () => ({
  PlanetsPage: ({ featuredPlanet }: { featuredPlanet: { planetPortal: string } }) => (
    <div data-testid="embedded-planet">{featuredPlanet.planetPortal}</div>
  ),
}));

const user = makeMember({ publicId: "u1", email: "user@example.com", nmsName: "Tamer" });
const moderator = makeMember({
  publicId: "mod",
  email: "mod@example.com",
  nmsName: "Mod",
  role: "moderator",
  simpleView: false,
});
const roster = [
  makeMember({ publicId: "u2", email: "zed@example.com", nmsName: "Zed" }),
  makeMember({ publicId: "u3", email: "aaron@example.com", nmsName: "Aaron" }),
  moderator,
];

function pet(overrides: Partial<PetEntry> = {}): PetEntry {
  return {
    id: "pet-1",
    name: "Fluffy",
    petType: "frost",
    activity: "nocturnal",
    habitat: "mountain",
    rarity: "rare",
    eggTradeAvailable: true,
    classes: { combat: "S", agility: "A", health: "B" },
    portal: "0123456789AB",
    galaxy: 0,
    planetName: "Ruba",
    ownerId: user.publicId,
    ownerName: "Tamer",
    ownerMemberId: user.publicId,
    createdAt: "2026-05-01T12:00:00.000Z",
    canManage: true,
    ...overrides,
  };
}

function renderPets(member: AllianceMember = user, locale: "en" | "it" = "en") {
  return renderPage(<PetsPage alliance={defaultAlliance} currentMember={member} missionCount={0} stationCount={0} />, {
    locale,
  });
}

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PetsPage list", () => {
  it("shows the empty state, then the pets in cards", async () => {
    mockFetch({ "GET /api/pets": { pets: [] } });
    const { unmount } = renderPets();
    expect(await screen.findByText(t("pets.no_pets"))).toBeInTheDocument();
    unmount();

    mockFetch({
      "GET /api/pets": {
        pets: [pet({ coordinates: "+1, -2", note: "Very friendly", imageUrl: "/api/pets/image?path=x" })],
      },
    });
    renderPets();
    const card = (await screen.findByText("Fluffy")).closest("li") as HTMLElement;
    expect(within(card).getByText("Ruba")).toBeInTheDocument();
    expect(within(card).getByText("0123456789AB")).toBeInTheDocument();
    const typeChip = within(card).getByText(t("pets.type_frost")).closest("li") as HTMLElement;
    expect(typeChip).toHaveClass("pet-card-type");
    expect(typeChip.style.getPropertyValue("--pet-type-color")).toBe("#6DC9EE");
    expect(typeChip.querySelector("svg")).not.toBeNull();
    expect(within(card).getByText(t("pets.activity_nocturnal"))).toBeInTheDocument();
    expect(within(card).getByText(t("pets.habitat_mountain"))).toBeInTheDocument();
    expect(within(card).getByText(t("pets.rarity_rare"))).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: t("pets.egg_trade") })).toBeInTheDocument();
    expect(within(card).getByText("+1, -2")).toBeInTheDocument();
    expect(within(card).getByText("Very friendly")).toBeInTheDocument();
    const classes = within(card).getByRole("list", { name: t("pets.classes") });
    expect(within(classes).getByText(t("pets.combat")).nextSibling).toHaveTextContent("S");
    expect(within(classes).getByText(t("pets.agility")).nextSibling).toHaveTextContent("A");
    expect(within(classes).getByText(t("pets.health")).nextSibling).toHaveTextContent("B");
    for (const [key, color] of [
      ["combat", "#F5AD19"],
      ["agility", "#9D43C9"],
      ["health", "#347DD0"],
    ]) {
      const row = within(classes)
        .getByText(t(`pets.${key}`))
        .closest("li") as HTMLElement;
      expect(row.style.getPropertyValue("--pet-grade-color")).toBe(color);
    }
    expect(card.querySelector(".pet-card-image")).toHaveAttribute("src", "/api/pets/image?path=x");
  });

  it("leaves out the activity, habitat and rarity chips that are unknown", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet({ activity: "unknown", habitat: "ground", rarity: "unknown" })] },
    });
    renderPets();
    const card = (await screen.findByText("Fluffy")).closest("li") as HTMLElement;
    const traits = within(card).getByRole("list", { name: t("pets.traits") });
    expect([...traits.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      t("pets.type_frost"),
      t("pets.habitat_ground"),
    ]);
    expect(within(card).queryByText(t("pets.activity_unknown"))).toBeNull();
    expect(within(card).queryByText(t("pets.rarity_unknown"))).toBeNull();
  });

  it("hides the egg trade chip, the image and the owner name when missing", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet({ eggTradeAvailable: false, ownerName: "", ownerMemberId: undefined })] },
    });
    renderPets();
    const card = (await screen.findByText("Fluffy")).closest("li") as HTMLElement;
    expect(within(card).queryByRole("img", { name: t("pets.egg_trade") })).toBeNull();
    expect(card.querySelector(".pet-card-image")).toBeNull();
    expect(within(card).getByText(t("pets.former_member"))).toBeInTheDocument();
  });

  it("shows an error toast when the list cannot be read", async () => {
    mockFetch({ "GET /api/pets": json({ error: "pets.error_unable_to_read" }, 503) });
    renderPets();
    expect(await screen.findByText(t("pets.error_unable_to_read"))).toBeInTheDocument();
  });

  it("splits the pets between the All and My pets tabs with counts", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet(), pet({ id: "pet-2", name: "Rex", ownerId: "u2", canManage: false })] },
    });
    const { user: actor } = renderPets();
    await screen.findByText("Rex");
    const all = screen.getByRole("tab", { name: new RegExp(t("pets.filter_all")) });
    const mine = screen.getByRole("tab", { name: new RegExp(t("pets.my_pets")) });
    expect(all).toHaveTextContent("2");
    expect(mine).toHaveTextContent("1");

    await actor.click(mine);
    expect(screen.queryByText("Rex")).toBeNull();
    expect(screen.getByText("Fluffy")).toBeInTheDocument();
  });

  it("searches by name, owner, planet and translated traits", async () => {
    mockFetch({
      "GET /api/pets": {
        pets: [
          pet(),
          pet({
            id: "pet-2",
            name: "Rex",
            petType: "fire",
            planetName: "Cinder",
            ownerName: "Ember",
            ownerId: "u2",
            canManage: false,
          }),
        ],
      },
    });
    const { user: actor } = renderPets();
    await screen.findByText("Rex");
    const search = screen.getByRole("textbox", { name: t("pets.search_pets") });

    await actor.type(search, "cinder");
    expect(screen.queryByText("Fluffy")).toBeNull();
    expect(screen.getByText("Rex")).toBeInTheDocument();

    await actor.clear(search);
    await actor.type(search, t("pets.type_frost").toLowerCase());
    expect(screen.queryByText("Rex")).toBeNull();
    expect(screen.getByText("Fluffy")).toBeInTheDocument();

    await actor.clear(search);
    await actor.type(search, "nothing like this");
    expect(await screen.findByText(t("pets.no_pets_found"))).toBeInTheDocument();
  });

  it("paginates the cards, newest first", async () => {
    const pets = Array.from({ length: 51 }, (_, index) =>
      pet({
        id: `pet-${index}`,
        name: `Pet ${index}`,
        createdAt: `2026-05-01T12:00:${String(index).padStart(2, "0")}.000Z`,
      }),
    );
    mockFetch({ "GET /api/pets": { pets } });
    const { user: actor } = renderPets();
    expect(await screen.findByText("Pet 50")).toBeInTheDocument();
    expect(screen.queryByText("Pet 0")).toBeNull();
    expect(screen.getAllByRole("listitem").filter((item) => item.classList.contains("pet-card"))).toHaveLength(50);

    await actor.click(screen.getByRole("button", { name: t("common.next_page") }));
    expect(screen.getByText("Pet 0")).toBeInTheDocument();
    expect(screen.queryByText("Pet 50")).toBeNull();
  });

  it("shows the edit and delete actions only for pets the member can manage", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet(), pet({ id: "pet-2", name: "Rex", ownerId: "u2", canManage: false })] },
    });
    renderPets();
    await screen.findByText("Rex");
    expect(screen.getByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("pets.edit_pet_named", { pet: "Rex" }) })).toBeNull();
    expect(screen.queryByRole("button", { name: t("pets.delete_pet_named", { pet: "Rex" }) })).toBeNull();
  });

  it("translates the labels in Italian", async () => {
    mockFetch({ "GET /api/pets": { pets: [pet()] } });
    renderPets(user, "it");
    await screen.findByText("Fluffy");
    expect(screen.getByText(t("pets.type_frost", undefined, "it"))).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: new RegExp(t("pets.my_pets", undefined, "it")) })).toBeInTheDocument();
  });
});

describe("PetsPage robustness", () => {
  it("falls back to generic messages for unreadable responses and rejected requests", async () => {
    mockFetch({ "GET /api/pets": new Response("not json", { status: 500 }) });
    const first = renderPets();
    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
    first.unmount();

    mockFetch({ "GET /api/pets": () => Promise.reject("offline") });
    const second = renderPets();
    expect(await screen.findByText(t("pets.error_unable_to_read"))).toBeInTheDocument();
    second.unmount();

    mockFetch({ "GET /api/pets": { pets: [pet()] }, "DELETE /api/pets": () => Promise.reject("offline") });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.delete_pet_named", { pet: "Fluffy" }) }));
    expect(await screen.findByText(t("pets.error_unable_to_remove"))).toBeInTheDocument();
  });

  it("ignores late responses after the page is closed", async () => {
    let resolve: (value: Response) => void = () => {};
    mockFetch({ "GET /api/pets": () => new Promise<Response>((done) => (resolve = done)) });
    const first = renderPets();
    first.unmount();
    resolve(json({ pets: [pet()] }));
    await Promise.resolve();

    let reject: (reason: unknown) => void = () => {};
    mockFetch({ "GET /api/pets": () => new Promise<Response>((_done, fail) => (reject = fail)) });
    const second = renderPets();
    second.unmount();
    reject(new Error("late"));
    await Promise.resolve();
  });

  it("switches back to the All tab", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet(), pet({ id: "pet-2", name: "Rex", ownerId: "u2", canManage: false })] },
    });
    const { user: actor } = renderPets();
    await screen.findByText("Rex");
    await actor.click(screen.getByRole("tab", { name: new RegExp(t("pets.my_pets")) }));
    expect(screen.queryByText("Rex")).toBeNull();
    await actor.click(screen.getByRole("tab", { name: new RegExp(t("pets.filter_all")) }));
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("opens the admin and profile panels", async () => {
    const admin = makeMember({
      publicId: "admin",
      nmsName: "Chief",
      role: "admin",
      simpleView: false,
      pulseEffectsEnabled: false,
    });
    mockFetch({
      "GET /api/pets": { pets: [] },
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user: actor } = renderPets(admin);
    await screen.findByText(t("pets.no_pets"));

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
});

describe("filters", () => {
  const filterPets = [
    pet({ id: "p1", name: "Fluffy" }),
    pet({
      id: "p2",
      name: "Rex",
      petType: "fire",
      activity: "diurnal",
      habitat: "ground",
      rarity: "common",
      eggTradeAvailable: false,
      classes: { combat: "C", agility: "C", health: "C" },
      createdAt: "2026-05-02T12:00:00.000Z",
    }),
  ];

  async function openFilters() {
    mockFetch({ "GET /api/pets": { pets: filterPets } });
    const rendered = renderPets();
    await screen.findByText("Rex");
    const toggle = screen.getByRole("button", { name: t("planet.filters") });
    await rendered.user.click(toggle);
    const panel = document.getElementById("pet-filters-panel") as HTMLElement;
    return { ...rendered, toggle, panel };
  }

  it("opens a panel with every filter and keeps the toggle state accessible", async () => {
    const { panel, toggle, user: actor } = await openFilters();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "pet-filters-panel");
    const labels = within(panel)
      .getAllByRole("combobox")
      .map((select) => select.getAttribute("aria-label"));
    expect(labels).toEqual(
      [
        "pets.pet_type",
        "pets.activity",
        "pets.habitat",
        "pets.rarity",
        "pets.egg_trade",
        "pets.combat",
        "pets.agility",
        "pets.health",
      ].map((key) => t("pets.filter_by", { field: t(key) })),
    );
    await actor.click(toggle);
    expect(document.getElementById("pet-filters-panel")).toBeNull();
  });

  it.each([
    ["pets.pet_type", "frost", "pets.type_frost"],
    ["pets.activity", "diurnal", "pets.activity_diurnal"],
    ["pets.habitat", "ground", "pets.habitat_ground"],
    ["pets.rarity", "common", "pets.rarity_common"],
    ["pets.egg_trade", "yes", "pets.egg_trade_yes"],
    ["pets.combat", "C", undefined],
    ["pets.agility", "S", undefined],
    ["pets.health", "B", undefined],
  ])("filters by %s and shows a removable tag", async (label, value, valueLabel) => {
    const { panel, toggle, user: actor } = await openFilters();
    const select = within(panel).getByRole("combobox", { name: t("pets.filter_by", { field: t(label) }) });
    await actor.selectOptions(select, value);

    const tag = `${t(label)}: ${valueLabel ? t(valueLabel) : value}`;
    expect(screen.getByText(tag)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("data-active");
    const visible = filterPets.filter((entry) => screen.queryByText(entry.name) !== null);
    expect(visible.length).toBeLessThan(2);

    await actor.click(screen.getByRole("button", { name: `${t("planet.remove_filter")}: ${tag}` }));
    expect(screen.queryByText(tag)).toBeNull();
    expect(screen.getByText("Fluffy")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("combines filters with the search and the tabs, then resets them", async () => {
    const { panel, user: actor } = await openFilters();
    await actor.selectOptions(
      within(panel).getByRole("combobox", { name: t("pets.filter_by", { field: t("pets.egg_trade") }) }),
      "no",
    );
    expect(screen.queryByText("Fluffy")).toBeNull();
    expect(screen.getByText("Rex")).toBeInTheDocument();

    await actor.selectOptions(
      within(panel).getByRole("combobox", { name: t("pets.filter_by", { field: t("pets.pet_type") }) }),
      "frost",
    );
    expect(await screen.findByText(t("pets.no_pets_match_filters"))).toBeInTheDocument();

    await actor.type(screen.getByRole("textbox", { name: t("pets.search_pets") }), "zzz");
    expect(await screen.findByText(t("pets.no_pets_found"))).toBeInTheDocument();

    await actor.clear(screen.getByRole("textbox", { name: t("pets.search_pets") }));
    await actor.click(screen.getByRole("button", { name: t("planet.reset_filters") }));
    expect(screen.getByText("Fluffy")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("planet.reset_filters") })).toBeNull();
  });
});

describe("pet form", () => {
  async function openForm(routes: Parameters<typeof mockFetch>[0] = {}) {
    const mocks = mockFetch({
      "GET /api/pets": { pets: [] },
      "/api/missions/verify-system": { found: true, planetType: "Lush", planetName: "Ruba Prime" },
      ...routes,
    });
    const rendered = renderPets();
    await screen.findByText(t("pets.no_pets"));
    await rendered.user.click(screen.getByRole("button", { name: t("pets.add_pet") }));
    const dialog = screen.getByRole("dialog", { name: t("pets.add_pet") });
    return { ...mocks, ...rendered, dialog };
  }

  async function fillRequired(actor: ReturnType<typeof renderPets>["user"], dialog: HTMLElement) {
    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");
    for (const key of ["combat", "agility", "health"]) {
      await actor.selectOptions(within(dialog).getByRole("combobox", { name: t(`pets.${key}`) }), "A");
    }
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "frost");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "0123456789ab",
    );
    await waitFor(
      () => expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Ruba Prime"),
      {
        timeout: 2000,
      },
    );
  }

  it("starts with default options and the classes and type unselected", async () => {
    const { dialog } = await openForm();
    for (const label of ["pets.activity", "pets.habitat", "pets.rarity"]) {
      expect(within(dialog).getByRole("combobox", { name: t(label) })).toHaveValue("unknown");
    }
    for (const label of ["pets.combat", "pets.agility", "pets.health", "pets.pet_type"]) {
      expect(within(dialog).getByRole("combobox", { name: t(label) })).toHaveValue("");
    }
    expect(within(dialog).getByRole("switch", { name: t("pets.egg_trade") })).not.toBeChecked();
    const grades = within(within(dialog).getByRole("combobox", { name: t("pets.combat") }))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(grades).toEqual([t("pets.select_class"), "S", "A", "B", "C"]);
  });

  it("shows the icon of the selected pet type next to the label", async () => {
    const { dialog, user: actor } = await openForm();
    const label = within(dialog)
      .getByRole("combobox", { name: t("pets.pet_type") })
      .closest("label") as HTMLElement;
    expect(label.querySelector("svg")).toBeNull();
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "fire");
    expect(label.querySelector("svg")?.style.color).not.toBe("");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "");
    expect(label.querySelector("svg")).toBeNull();
  });

  it("validates the type, classes and portal before sending", async () => {
    const { dialog, requests, user: actor } = await openForm();
    const submit = within(dialog).getByRole("button", { name: t("common.add") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");

    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await within(dialog).findByText(t("pets.error_type_required"))).toBeInTheDocument();

    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "fire");
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await within(dialog).findByText(t("farms.error_invalid_portal_and_galaxy"))).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(requests("POST", "/api/pets")).toHaveLength(0);
  });

  it("requires the three classes and the planet name", async () => {
    const {
      dialog,
      requests,
      user: actor,
    } = await openForm({
      "/api/missions/verify-system": { found: false },
    });
    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "fire");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "0123456789ab",
    );
    await waitFor(() => expect(within(dialog).getByRole("button", { name: t("common.add") })).toBeEnabled());

    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await within(dialog).findByText(t("farms.error_planet_name_required"))).toBeInTheDocument();

    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "Ruba");
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await within(dialog).findByText(t("pets.error_classes_required"))).toBeInTheDocument();
    expect(requests("POST", "/api/pets")).toHaveLength(0);
  });

  it("adds a pet with the planet name from the lookup and every field in the payload", async () => {
    const {
      dialog,
      requests,
      user: actor,
    } = await openForm({
      "POST /api/pets": { pets: [pet({ name: "New pet" })] },
    });
    await fillRequired(actor, dialog);
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.activity") }), "diurnal");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.habitat") }), "flying");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.rarity") }), "rare");
    await actor.click(within(dialog).getByRole("switch", { name: t("pets.egg_trade") }));
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.coordinates") }), "+1, -2");
    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.notes") }), "friendly");
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));

    expect(await screen.findByText(t("pets.pet_added"))).toBeInTheDocument();
    const form = requests("POST", "/api/pets")[0].body as FormData;
    expect(JSON.parse(form.get("payload") as string)).toEqual({
      name: "Fluffy",
      petType: "frost",
      activity: "diurnal",
      habitat: "flying",
      rarity: "rare",
      eggTradeAvailable: true,
      classes: { combat: "A", agility: "A", health: "A" },
      portal: "0123456789AB",
      galaxy: 0,
      planetName: "Ruba Prime",
      coordinates: "+1, -2",
      note: "friendly",
    });
    expect(form.get("image")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("New pet")).toBeInTheDocument();
  });

  it("lets the member pick a galaxy and keeps a typed planet name when the planet is unknown", async () => {
    const {
      dialog,
      requests,
      user: actor,
    } = await openForm({
      "/api/missions/verify-system": { found: false },
      "POST /api/pets": { pets: [pet()] },
    });
    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");
    for (const key of ["combat", "agility", "health"]) {
      await actor.selectOptions(within(dialog).getByRole("combobox", { name: t(`pets.${key}`) }), "S");
    }
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "toxic");
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "5");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "0123456789ab",
    );
    await actor.type(within(dialog).getByRole("textbox", { name: t("farms.planet_name") }), "Mystery");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: t("common.add") })).toBeEnabled());
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));

    await screen.findByText(t("pets.pet_added"));
    const payload = JSON.parse((requests("POST", "/api/pets")[0].body as FormData).get("payload") as string);
    expect(payload).toMatchObject({ galaxy: 5, planetName: "Mystery", portal: "0123456789AB" });
  });

  it("announces added and deleted pets so the sidebar counter refreshes, but not edits", async () => {
    const changed = vi.fn();
    window.addEventListener("pets-changed", changed);
    mockFetch({
      "GET /api/pets": { pets: [pet()] },
      "/api/missions/verify-system": { found: true, planetName: "Ruba Prime" },
      "POST /api/pets": { pets: [pet(), pet({ id: "pet-2", name: "New" })] },
      "PATCH /api/pets": { pets: [pet({ name: "Renamed" })] },
      "DELETE /api/pets": { pets: [] },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user: actor } = renderPets();
    await screen.findByText("Fluffy");

    await actor.click(screen.getByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) }));
    const editDialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    const save = within(editDialog).getByRole("button", { name: t("common.save") });
    await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
    await actor.click(save);
    await screen.findByText(t("pets.pet_updated"));
    expect(changed).not.toHaveBeenCalled();

    await actor.click(screen.getByRole("button", { name: t("pets.delete_pet_named", { pet: "Renamed" }) }));
    await screen.findByText(t("pets.pet_deleted"));
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("pets-changed", changed);
  });

  it("shows the server error without closing the form", async () => {
    const { dialog, user: actor } = await openForm({
      "POST /api/pets": json({ error: "pets.error_unable_to_save" }, 503),
    });
    await fillRequired(actor, dialog);
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));
    expect(await within(dialog).findByText(t("pets.error_unable_to_save"))).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes without saving", async () => {
    const { dialog, user: actor } = await openForm();
    await actor.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("previews a valid image, sends it and lets the member remove it", async () => {
    const { dialog, requests, user: actor } = await openForm({ "POST /api/pets": { pets: [pet()] } });
    await fillRequired(actor, dialog);
    const file = new File(["png"], "pet.png", { type: "image/png" });
    await actor.upload(within(dialog).getByLabelText(t("pets.image")), file);
    expect(dialog.querySelector(".pet-image-preview")).toHaveStyle({ backgroundImage: 'url("blob:preview")' });

    await actor.click(within(dialog).getByRole("button", { name: t("pets.remove_image") }));
    expect(dialog.querySelector(".pet-image-preview-empty")).not.toBeNull();
    expect(within(dialog).queryByRole("button", { name: t("pets.remove_image") })).toBeNull();

    await actor.upload(within(dialog).getByLabelText(t("pets.image")), file);
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));
    await screen.findByText(t("pets.pet_added"));
    expect((requests("POST", "/api/pets")[0].body as FormData).get("image")).toBeInstanceOf(File);
  });

  it("opens the file picker from the placeholder and from the loaded image, not only from the input", async () => {
    const { dialog, user: actor } = await openForm();
    const input = within(dialog).getByLabelText(t("pets.image")) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    const preview = within(dialog).getByRole("button", { name: t("pets.choose_image") });
    expect(preview).toHaveClass("pet-image-preview-empty");
    await actor.click(preview);
    expect(click).toHaveBeenCalledTimes(1);

    await actor.upload(input, new File(["png"], "pet.png", { type: "image/png" }));
    expect(dialog.querySelector(".pet-image-preview-empty")).toBeNull();
    await actor.click(within(dialog).getByRole("button", { name: t("pets.choose_image") }));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("rejects an image of the wrong type or size", async () => {
    const { dialog } = await openForm();
    const input = within(dialog).getByLabelText(t("pets.image"));
    fireEvent.change(input, { target: { files: [new File(["gif"], "pet.gif", { type: "image/gif" })] } });
    expect(await within(dialog).findByText(t("pets.error_image_invalid"))).toBeInTheDocument();
    expect(dialog.querySelector(".pet-image-preview-empty")).not.toBeNull();

    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await within(dialog).findByText(t("pets.error_image_invalid"))).toBeInTheDocument();
  });

  it("ignores an empty file selection and invalid option values", async () => {
    const { dialog } = await openForm();
    fireEvent.change(within(dialog).getByLabelText(t("pets.image")), { target: { files: [] } });
    expect(dialog.querySelector(".pet-image-preview-empty")).not.toBeNull();
    for (const label of ["pets.activity", "pets.habitat", "pets.rarity"]) {
      const select = within(dialog).getByRole("combobox", { name: t(label) });
      fireEvent.change(select, { target: { value: "bogus" } });
      expect(select).toHaveValue("unknown");
    }
  });

  it("requires the pet name and reports unexpected save failures", async () => {
    const { dialog, user: actor } = await openForm({ "POST /api/pets": () => Promise.reject("offline") });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(await within(dialog).findByText(t("pets.error_name_required"))).toBeInTheDocument();

    await fillRequired(actor, dialog);
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));
    expect(await within(dialog).findByText(t("errors.save_failed"))).toBeInTheDocument();
  });
});

describe("pet image dialog", () => {
  const withImage = () => pet({ imageUrl: "/api/pets/image?path=x" });

  async function openImage() {
    mockFetch({ "GET /api/pets": { pets: [withImage()] } });
    const rendered = renderPets();
    await rendered.user.click(await screen.findByRole("button", { name: t("pets.enlarge_image", { name: "Fluffy" }) }));
    return { ...rendered, dialog: screen.getByRole("dialog", { name: "Fluffy" }) };
  }

  it("opens the large image from the small one, only when the pet has an image", async () => {
    const { dialog } = await openImage();
    const image = within(dialog).getByRole("img", { name: t("pets.image_of", { name: "Fluffy" }) });
    expect(image).toHaveAttribute("src", "/api/pets/image?path=x");
    expect(dialog.closest(".pet-image-backdrop")?.parentElement).toBe(document.body);
  });

  it("offers no enlarge button without an image", async () => {
    mockFetch({ "GET /api/pets": { pets: [pet()] } });
    renderPets();
    await screen.findByText("Fluffy");
    expect(screen.queryByRole("button", { name: t("pets.enlarge_image", { name: "Fluffy" }) })).toBeNull();
  });

  it("closes with the close button, Escape or a click on the backdrop, but not from the image itself", async () => {
    const { dialog, user: actor } = await openImage();
    await actor.click(within(dialog).getByRole("img"));
    expect(screen.getByRole("dialog", { name: "Fluffy" })).toBeInTheDocument();

    await actor.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog", { name: "Fluffy" })).toBeNull();

    await actor.click(screen.getByRole("button", { name: t("pets.enlarge_image", { name: "Fluffy" }) }));
    await actor.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Fluffy" })).toBeNull();

    await actor.click(screen.getByRole("button", { name: t("pets.enlarge_image", { name: "Fluffy" }) }));
    const backdrop = screen.getByRole("dialog", { name: "Fluffy" }).closest(".pet-image-backdrop") as HTMLElement;
    await actor.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Fluffy" })).toBeNull();
  });

  it("ignores other keys", async () => {
    const { user: actor } = await openImage();
    await actor.keyboard("a");
    expect(screen.getByRole("dialog", { name: "Fluffy" })).toBeInTheDocument();
  });
});

describe("egg trade message", () => {
  const eggPet = (overrides: Partial<PetEntry> = {}) =>
    pet({
      id: "pet-egg",
      name: "Eggy",
      ownerId: "u2",
      ownerName: "Zed",
      ownerMemberId: "u2",
      canManage: false,
      canMessageOwner: true,
      ...overrides,
    });

  it("shows an egg button next to the discoverer only when the member can message them", async () => {
    mockFetch({
      "GET /api/pets": {
        pets: [
          eggPet(),
          eggPet({
            id: "own",
            name: "Mine",
            ownerId: "u1",
            ownerName: "Tamer",
            ownerMemberId: "u1",
            canMessageOwner: false,
          }),
          eggPet({ id: "no-egg", name: "Plain", eggTradeAvailable: false }),
        ],
      },
    });
    renderPets();
    const card = (await screen.findByText("Eggy")).closest("li") as HTMLElement;
    expect(
      within(card).getByRole("button", { name: t("pets.message_discoverer_named", { name: "Zed" }) }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("img", { name: t("pets.egg_trade") })).toBeNull();

    const own = screen.getByText("Mine").closest("li") as HTMLElement;
    expect(within(own).queryByRole("button", { name: /egg trade/i })).toBeNull();
    expect(within(own).getByRole("img", { name: t("pets.egg_trade") })).toBeInTheDocument();

    const plain = screen.getByText("Plain").closest("li") as HTMLElement;
    expect(within(plain).queryByRole("button", { name: /egg trade/i })).toBeNull();
    expect(within(plain).queryByRole("img", { name: t("pets.egg_trade") })).toBeNull();
  });

  it("sends a private pet message to the discoverer after confirming the notice", async () => {
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [eggPet()] },
      "POST /api/messages": { ok: true },
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.message_discoverer_named", { name: "Zed" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.message_discoverer") });
    expect(within(dialog).getByText(t("profile.message_recipient", { recipient: "Zed" }))).toBeInTheDocument();
    expect(within(dialog).getByText("Eggy")).toBeInTheDocument();
    const send = within(dialog).getByRole("button", { name: t("profile.send_message") });
    expect(send).toBeDisabled();

    await actor.type(within(dialog).getByRole("textbox", { name: t("profile.message_text") }), "Want to trade eggs?");
    expect(send).toBeDisabled();
    await actor.click(within(dialog).getByRole("checkbox", { name: t("messages.pet_only_notice") }));
    await actor.click(send);

    expect(await screen.findByText(t("profile.message_sent"))).toBeInTheDocument();
    expect(requests("POST", "/api/messages")[0].body).toEqual({
      recipientId: "u2",
      message: "Want to trade eggs?",
      context: { type: "pet", petId: "pet-egg" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the server error inside the dialog and can be closed", async () => {
    mockFetch({
      "GET /api/pets": { pets: [eggPet()] },
      "POST /api/messages": json({ error: "profile.message_context_invalid" }, 400),
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.message_discoverer_named", { name: "Zed" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.message_discoverer") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("profile.message_text") }), "Hi");
    await actor.click(within(dialog).getByRole("checkbox", { name: t("messages.pet_only_notice") }));
    await actor.click(within(dialog).getByRole("button", { name: t("profile.send_message") }));
    expect(await within(dialog).findByText(t("profile.message_context_invalid"))).toBeInTheDocument();

    await actor.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to a generic error for unreadable or rejected requests", async () => {
    mockFetch({
      "GET /api/pets": { pets: [eggPet()] },
      "POST /api/messages": new Response("nope", { status: 500 }),
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.message_discoverer_named", { name: "Zed" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.message_discoverer") });
    await actor.type(within(dialog).getByRole("textbox", { name: t("profile.message_text") }), "Hi");
    await actor.click(within(dialog).getByRole("checkbox", { name: t("messages.pet_only_notice") }));
    await actor.click(within(dialog).getByRole("button", { name: t("profile.send_message") }));
    expect(await within(dialog).findByText(t("profile.message_unable_to_save"))).toBeInTheDocument();
  });

  it("does nothing without a recipient member and closes from the header button", async () => {
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [eggPet({ ownerMemberId: undefined })] },
      "POST /api/messages": { ok: true },
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.message_discoverer_named", { name: "Zed" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.message_discoverer") });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(requests("POST", "/api/messages")).toHaveLength(0);
    await actor.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("discoverer", () => {
  it("shows the unassigned and former member labels and searches the unassigned label", async () => {
    mockFetch({
      "GET /api/pets": {
        pets: [
          pet({ id: "pet-1", name: "Loner", ownerId: null, ownerName: "", ownerMemberId: undefined, canManage: false }),
          pet({ id: "pet-2", name: "Rex", ownerId: "u2", ownerName: "Zed", canManage: false }),
        ],
      },
    });
    const { user: actor } = renderPets();
    const loner = (await screen.findByText("Loner")).closest("li") as HTMLElement;
    expect(within(loner).getByText(t("pets.discoverer"))).toBeInTheDocument();
    expect(within(loner).getByText(t("pets.unassigned"))).toBeInTheDocument();
    expect(within(loner).queryByRole("button", { name: t("pets.edit_pet_named", { pet: "Loner" }) })).toBeNull();

    await actor.type(screen.getByRole("textbox", { name: t("pets.search_pets") }), t("pets.unassigned").toLowerCase());
    expect(screen.queryByText("Rex")).toBeNull();
    expect(screen.getByText("Loner")).toBeInTheDocument();
  });

  it("does not offer a discoverer select to regular users and sends no discoverer", async () => {
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [] },
      "/api/missions/verify-system": { found: true, planetName: "Ruba Prime" },
      "POST /api/pets": { pets: [pet()] },
    });
    const { user: actor } = renderPets();
    await screen.findByText(t("pets.no_pets"));
    await actor.click(screen.getByRole("button", { name: t("pets.add_pet") }));
    const dialog = screen.getByRole("dialog", { name: t("pets.add_pet") });
    expect(within(dialog).queryByRole("combobox", { name: t("pets.discoverer") })).toBeNull();
    expect(requests("GET", "/api/members")).toHaveLength(0);

    await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");
    for (const key of ["combat", "agility", "health"]) {
      await actor.selectOptions(within(dialog).getByRole("combobox", { name: t(`pets.${key}`) }), "A");
    }
    await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "frost");
    await actor.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "0123456789ab",
    );
    await waitFor(
      () => expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Ruba Prime"),
      {
        timeout: 2000,
      },
    );
    await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));
    await screen.findByText(t("pets.pet_added"));
    const payload = JSON.parse((requests("POST", "/api/pets")[0].body as FormData).get("payload") as string);
    expect("ownerId" in payload).toBe(false);
  });

  it("lets staff pick the discoverer, defaulting to themselves, or leave it unassigned", async () => {
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [] },
      "GET /api/members": roster,
      "/api/missions/verify-system": { found: true, planetName: "Ruba Prime" },
      "POST /api/pets": { pets: [pet()] },
    });
    const { user: actor } = renderPets(moderator);
    await screen.findByText(t("pets.no_pets"));

    async function addWith(choice?: string) {
      await actor.click(screen.getByRole("button", { name: t("pets.add_pet") }));
      const dialog = screen.getByRole("dialog", { name: t("pets.add_pet") });
      const select = within(dialog).getByRole("combobox", { name: t("pets.discoverer") });
      await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(2));
      expect(
        within(select)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([t("pets.unassigned"), "Mod", "Aaron", "Zed"]);
      expect(select).toHaveValue("mod");
      if (choice !== undefined) await actor.selectOptions(select, choice);
      await actor.type(within(dialog).getByRole("textbox", { name: t("pets.pet_name") }), "Fluffy");
      for (const key of ["combat", "agility", "health"]) {
        await actor.selectOptions(within(dialog).getByRole("combobox", { name: t(`pets.${key}`) }), "A");
      }
      await actor.selectOptions(within(dialog).getByRole("combobox", { name: t("pets.pet_type") }), "frost");
      await actor.type(
        within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
        "0123456789ab",
      );
      await waitFor(
        () => expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Ruba Prime"),
        {
          timeout: 2000,
        },
      );
      await actor.click(within(dialog).getByRole("button", { name: t("common.add") }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }

    await addWith();
    await addWith("u2");
    await addWith("");
    const owners = requests("POST", "/api/pets").map(
      (call) => JSON.parse((call.body as FormData).get("payload") as string).ownerId,
    );
    expect(owners).toEqual(["mod", "u2", null]);
  });

  it("keeps the unassigned and former member choices when editing", async () => {
    mockFetch({
      "GET /api/pets": {
        pets: [
          pet({ id: "pet-1", name: "Loner", ownerId: null, ownerName: "", ownerMemberId: undefined }),
          pet({ id: "pet-2", name: "Orphan", ownerId: "gone", ownerName: "", ownerMemberId: undefined }),
        ],
      },
      "GET /api/members": roster,
    });
    const { user: actor } = renderPets(moderator);
    await actor.click(await screen.findByRole("button", { name: t("pets.edit_pet_named", { pet: "Loner" }) }));
    let dialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    expect(within(dialog).getByRole("combobox", { name: t("pets.discoverer") })).toHaveValue("");
    await actor.click(within(dialog).getByRole("button", { name: t("common.cancel") }));

    await actor.click(screen.getByRole("button", { name: t("pets.edit_pet_named", { pet: "Orphan" }) }));
    dialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    const select = within(dialog).getByRole("combobox", { name: t("pets.discoverer") });
    expect(select).toHaveValue("gone");
    expect(within(select).getByRole("option", { name: t("pets.former_member") })).toBeInTheDocument();
  });

  it("warns when the members cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({ "GET /api/pets": { pets: [] }, "GET /api/members": json({ error: "nope" }, 500) });
    renderPets(moderator);
    expect(await screen.findByText(t("errors.unable_to_load_members"))).toBeInTheDocument();
  });
});

describe("editing and deleting", () => {
  it("opens the form with the pet data and sends the id, keeping or removing the image", async () => {
    const existing = pet({
      coordinates: "+1, -2",
      note: "hello",
      imageUrl: "/api/pets/image?path=alliance-manager/pets/x.png",
    });
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [existing] },
      "PATCH /api/pets": { pets: [{ ...existing, name: "Rex" }] },
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    expect(within(dialog).getByRole("textbox", { name: t("pets.pet_name") })).toHaveValue("Fluffy");
    expect(within(dialog).getByRole("combobox", { name: t("pets.pet_type") })).toHaveValue("frost");
    expect(within(dialog).getByRole("combobox", { name: t("pets.combat") })).toHaveValue("S");
    expect(within(dialog).getByRole("switch", { name: t("pets.egg_trade") })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: t("farms.planet_name") })).toHaveValue("Ruba");
    expect(dialog.querySelector(".pet-image-preview")).toHaveStyle({
      backgroundImage: 'url("/api/pets/image?path=alliance-manager/pets/x.png")',
    });

    const name = within(dialog).getByRole("textbox", { name: t("pets.pet_name") });
    await actor.clear(name);
    await actor.type(name, "Rex");
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));

    expect(await screen.findByText(t("pets.pet_updated"))).toBeInTheDocument();
    const payload = JSON.parse((requests("PATCH", "/api/pets")[0].body as FormData).get("payload") as string);
    expect(payload).toMatchObject({ id: "pet-1", name: "Rex", portal: "0123456789AB", planetName: "Ruba" });
    expect(payload.removeImage).toBeUndefined();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("clears the planet name when the portal changes and refills it from the lookup", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet()] },
      "/api/missions/verify-system": { found: true, planetName: "Fresh planet" },
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    const address = within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") });
    await actor.type(address, "{Backspace}1");
    const planet = within(dialog).getByRole("textbox", { name: t("farms.planet_name") });
    await waitFor(() => expect(planet).toHaveValue("Fresh planet"), { timeout: 2000 });
  });

  it("flags the image for removal when the member removes it", async () => {
    const existing = pet({ imageUrl: "/api/pets/image?path=alliance-manager/pets/x.png" });
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [existing] },
      "PATCH /api/pets": { pets: [{ ...existing, imageUrl: undefined }] },
    });
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) }));
    const dialog = screen.getByRole("dialog", { name: t("pets.edit_pet") });
    await actor.click(within(dialog).getByRole("button", { name: t("pets.remove_image") }));
    await actor.click(within(dialog).getByRole("button", { name: t("common.save") }));
    await screen.findByText(t("pets.pet_updated"));
    const payload = JSON.parse((requests("PATCH", "/api/pets")[0].body as FormData).get("payload") as string);
    expect(payload.removeImage).toBe(true);
  });

  it("deletes a pet after confirming", async () => {
    const { requests } = mockFetch({
      "GET /api/pets": { pets: [pet()] },
      "DELETE /api/pets": { pets: [] },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user: actor } = renderPets();
    const button = await screen.findByRole("button", { name: t("pets.delete_pet_named", { pet: "Fluffy" }) });

    await actor.click(button);
    expect(requests("DELETE", "/api/pets")).toHaveLength(0);

    await actor.click(button);
    expect(confirm).toHaveBeenLastCalledWith(t("pets.delete_pet_confirm", { pet: "Fluffy" }));
    expect(await screen.findByText(t("pets.pet_deleted"))).toBeInTheDocument();
    expect(requests("DELETE", "/api/pets")[0].body).toEqual({ id: "pet-1" });
    expect(screen.queryByText("Fluffy")).toBeNull();
  });

  it("shows an error toast when the deletion fails", async () => {
    mockFetch({
      "GET /api/pets": { pets: [pet()] },
      "DELETE /api/pets": json({ error: "pets.error_unable_to_remove" }, 503),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user: actor } = renderPets();
    await actor.click(await screen.findByRole("button", { name: t("pets.delete_pet_named", { pet: "Fluffy" }) }));
    expect(await screen.findByText(t("pets.error_unable_to_remove"))).toBeInTheDocument();
    expect(screen.getByText("Fluffy")).toBeInTheDocument();
  });
});

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

function renderDetail(detail: PetDetail, member: AllianceMember = user) {
  return renderPage(
    <PetsPage alliance={defaultAlliance} currentMember={member} detail={detail} missionCount={0} stationCount={0} />,
  );
}

describe("pet cards", () => {
  it("opens the pet detail from the card title", async () => {
    mockFetch({ "GET /api/pets": { pets: [pet()] } });
    window.history.replaceState(null, "", "/pets");
    renderPets();
    const link = await screen.findByRole("link", { name: "Fluffy" });
    expect(link.getAttribute("href")).toMatch(/^\/pets\/pet-1\?from=pets&returnTo=%2Fpets/);
    window.history.replaceState(null, "", "/");
  });
});

describe("detail", () => {
  it("shows only the selected pet with the embedded station, the unavailable notice and the pets origin", async () => {
    const { calls } = mockFetch({ "GET /api/pets": { pets: [pet({ stationHref: "/stations/x" })] } });
    renderDetail({
      id: "pet-1",
      origin: "planets",
      planetDataUnavailable: true,
      stationDetail: {
        station: { portal: "1123456789AB", galaxy: 0, ownerId: user.publicId },
        system: { portal: "1123456789AB", galaxy: 0 },
        origin: "pets",
        planets: [],
        almanacLookupFailed: false,
        featuredPlanet: planet({ planetPortal: "0123456789AB" }),
      },
    });
    expect(await screen.findByText("Fluffy")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fluffy" })).toBeNull();
    expect(calls.some((call) => call.url.searchParams.get("detailPet") === "pet-1")).toBe(true);
    expect(screen.getByTestId("embedded-station")).toHaveTextContent("0123456789AB");
    expect(screen.getByTestId("embedded-station")).toHaveAttribute("data-origin", "pets");
    expect(screen.getByRole("status")).toHaveTextContent(t("farms.planet_data_unavailable"));
    expect(screen.queryByTestId("embedded-planet")).toBeNull();
    expect(screen.queryByRole("button", { name: t("pets.add_pet") })).toBeNull();
    expect(screen.queryByRole("textbox", { name: t("pets.search_pets") })).toBeNull();
    expect(screen.getByRole("link", { name: t("details.back_to_planets") })).toBeInTheDocument();
  });

  it("shows the cached planet without a station and ignores mismatched planet data", async () => {
    mockFetch({ "GET /api/pets": { pets: [pet()] } });
    const { unmount } = renderDetail({ id: "pet-1", origin: "pets", planet: planet() });
    expect(await screen.findByTestId("embedded-planet")).toHaveTextContent("0123456789AB");
    expect(screen.queryByTestId("embedded-station")).toBeNull();
    unmount();

    renderDetail({
      id: "pet-1",
      origin: "pets",
      planet: planet({ galaxy: 1 }),
      stationDetail: {
        station: { portal: "1123456789AB", galaxy: 0, ownerId: user.publicId },
        system: { portal: "1123456789AB", galaxy: 0 },
        origin: "pets",
        planets: [],
        almanacLookupFailed: false,
        featuredPlanet: planet({ planetPortal: "2123456789AB" }),
      },
    });
    expect(await screen.findByText("Fluffy")).toBeInTheDocument();
    expect(screen.queryByTestId("embedded-planet")).toBeNull();
    expect(screen.queryByTestId("embedded-station")).toBeNull();
  });

  it("shows every pet of the planet when opened from a planet card, the opened one first", async () => {
    const { calls } = mockFetch({
      "GET /api/pets": {
        pets: [
          pet({ id: "pet-old", name: "Older", createdAt: "2026-01-01T00:00:00.000Z" }),
          pet({ id: "pet-1", name: "Fluffy", createdAt: "2026-02-01T00:00:00.000Z" }),
          pet({ id: "pet-new", name: "Newest", createdAt: "2026-03-01T00:00:00.000Z" }),
          pet({ id: "pet-far", name: "Elsewhere", portal: "2123456789AB" }),
        ],
      },
    });
    renderDetail({ id: "pet-1", origin: "planets" });
    expect(await screen.findByText("Newest")).toBeInTheDocument();
    expect(calls.find((call) => call.url.searchParams.has("detailPet"))?.url.searchParams.get("samePlanet")).toBe("1");
    const names = [...document.querySelectorAll(".pet-card-title")].map((node) => node.textContent);
    expect(names).toEqual(["Fluffy", "Newest", "Older"]);
    expect(screen.getByRole("region", { name: t("details.pets_on_planet") })).toBeInTheDocument();
    expect(screen.queryByText("Elsewhere")).toBeNull();
    expect(screen.queryByRole("link", { name: "Fluffy" })).toBeNull();
    expect(screen.getByRole("link", { name: "Newest" }).getAttribute("href")).toMatch(/^\/pets\/pet-new\?from=planets/);
  });

  it("keeps a single pet when the detail is opened from anywhere else", async () => {
    const { calls } = mockFetch({
      "GET /api/pets": { pets: [pet(), pet({ id: "pet-2", name: "Sibling" })] },
    });
    renderDetail({ id: "pet-1", origin: "pets" });
    expect(await screen.findByText("Fluffy")).toBeInTheDocument();
    expect(calls.find((call) => call.url.searchParams.has("detailPet"))?.url.searchParams.has("samePlanet")).toBe(
      false,
    );
    expect(screen.queryByText("Sibling")).toBeNull();
    expect(screen.getByRole("region", { name: t("details.pet") })).toBeInTheDocument();
  });

  it("reports a missing pet and refreshes the route after an edit", async () => {
    mockFetch({ "GET /api/pets": { pets: [] } });
    const { unmount } = renderDetail({ id: "pet-1", origin: "pets" });
    expect(await screen.findByText(t("pets.error_unable_to_read"))).toBeInTheDocument();
    unmount();

    router.refresh.mockClear();
    mockFetch({
      "GET /api/pets": { pets: [pet()] },
      "/api/missions/verify-system": { found: false },
      "PATCH /api/pets": { pets: [pet({ name: "Renamed" })] },
    });
    const { user: actor } = renderDetail({ id: "pet-1", origin: "pets" });
    await actor.click(await screen.findByRole("button", { name: t("pets.edit_pet_named", { pet: "Fluffy" }) }));
    const save = within(screen.getByRole("dialog")).getByRole("button", { name: t("common.save") });
    await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
    await actor.click(save);
    expect(await screen.findByText("Renamed")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("returns to the origin after deleting the open pet", async () => {
    router.replace.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch({ "GET /api/pets": { pets: [pet()] }, "DELETE /api/pets": { pets: [] } });
    renderDetail({ id: "pet-1", origin: "planets" });
    fireEvent.click(await screen.findByRole("button", { name: t("pets.delete_pet_named", { pet: "Fluffy" }) }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/planets"));
    expect(screen.queryByText(t("pets.pet_deleted"))).toBeNull();
  });
});
