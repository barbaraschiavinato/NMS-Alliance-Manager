// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanetListExamplePlanet, PlanetListExample } from "@/components/guide/planet-list-example";
import { renderWithLocale } from "../helpers";

// The guide sample is a fixed constant: replace it to exercise the fallbacks for incomplete Almanac data.
const sample = vi.hoisted(() => ({
  guideStationInit: { portal: "", galaxy: 0, response: {} as Record<string, unknown> },
}));

vi.mock("@/components/guide/station-init", () => sample);
vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("@/lib/nms-core/system.js", () => ({
  systemAttributes: () => ({ star_type: 0 }),
  planetSeeds: () => ({ planet_seeds: [1, 2], planet_count: 2, moon_count: 0 }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
});

function useSample(portal: string, response: Record<string, unknown>) {
  sample.guideStationInit = { portal, galaxy: 3, response };
}

describe("createPlanetListExamplePlanet", () => {
  it("builds a bare planet when the sample has no Almanac details", async () => {
    useSample("2123456789AB", { carries: "none", lines: [], pictures: { disc: "https://elsewhere/x.png" } });
    const planet = await createPlanetListExamplePlanet();
    expect(planet).toEqual({
      id: "2123456789AB:3",
      portal: "2123456789AB",
      planetPortal: "2123456789AB",
      planetNumber: 2,
      galaxy: 3,
      almanacName: "2123456789AB",
      almanacSearchIndex: "2123456789AB 2123456789AB",
      almanacFacts: [],
      systemFacts: [],
      discoveryCounts: {},
      plants: [],
      minerals: [],
      valuables: [],
      dissonant: false,
      paradise: undefined,
      blackMarket: false,
      station: { id: "2123456789AB:3", portal: "2123456789AB", galaxy: 3, name: "2123456789AB" },
    });
  });

  it("reads words, resources and flags from the sample, skipping malformed entries", async () => {
    useSample("1123456789AB", {
      name: "Station Name",
      paradise: true,
      carries: [
        { name: "Copper", kind: "mineral" },
        { name: "Copper", kind: "mineral" },
        { name: "Faecium", kind: "plant" },
        { name: "Gold", kind: "tradeable" },
        { name: "Mystery", kind: "unknown" },
        { name: 4, kind: "mineral" },
        null,
      ],
      lines: {
        headline: { word: "Verdant" },
        band: {
          type: { word: "Lush" },
          flora: { note: "19 plants" },
          fauna: { note: "12 species" },
          minerals: { word: "23" },
          size: { word: 7 },
          weather: "Calm",
          economy: { word: "Trading", stars: 2, black_market: true },
          sentinels: { word: "Low", ink: "exotic" },
        },
      },
      pictures: { disc: "/planets/v.png" },
    });
    const planet = await createPlanetListExamplePlanet();
    expect(planet).toMatchObject({
      planetPortal: "1123456789AB",
      planetNumber: 1,
      almanacName: "Verdant",
      imageUrl: "https://nmsalmanac.com/api/planets/v.png",
      almanacFacts: [
        { label: "common.planet_type_label", value: "Lush" },
        { label: "planet.sentinels", value: "Low" },
      ],
      systemFacts: [{ label: "common.economy", value: "Trading" }],
      planetType: "Lush",
      discoveryCounts: { flora: 19, fauna: 12, minerals: 23 },
      economyStars: 2,
      plants: ["Faecium"],
      minerals: ["Copper"],
      valuables: ["Gold"],
      dissonant: true,
      paradise: true,
      blackMarket: true,
      station: { name: "Station Name" },
    });
  });

  it("fails when the sample portal is not one of its system's planets", async () => {
    useSample("0123456789AB", {});
    await expect(createPlanetListExamplePlanet()).rejects.toThrow(
      "Guide sample planet address was not found in its system.",
    );
  });
});

describe("PlanetListExample", () => {
  it("shows the Almanac discovery counts on all example cards", async () => {
    useSample("1123456789AB", {
      lines: {
        headline: { word: "Verdant" },
        band: {
          flora: { note: "19 plants" },
          fauna: { note: "0 species" },
          minerals: { word: "23" },
        },
      },
    });
    const planet = await createPlanetListExamplePlanet();
    renderWithLocale(<PlanetListExample planet={planet} />);

    const cards = screen.getAllByRole("button", { name: /Verdant/ });
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      for (const label of ["Flora: 19", "Fauna: 0", "Minerals: 23"]) {
        expect(within(card).getByRole("img", { name: label })).toHaveAttribute("data-tooltip", label);
      }
    }
  });

  it("renders the example cards and the inline planet card for the sample", async () => {
    useSample("1123456789AB", { name: "Station Name", lines: { headline: { word: "Verdant" } } });
    const planet = await createPlanetListExamplePlanet();
    const { container } = renderWithLocale(<PlanetListExample planet={planet} />);
    expect(container.querySelectorAll(".planet-mission-card")).toHaveLength(4);
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 })).toHaveTextContent("Station Name");
  });

  it("lets the reader toggle the demo visited checkbox", async () => {
    useSample("1123456789AB", { lines: { headline: { word: "Verdant" } } });
    const planet = await createPlanetListExamplePlanet();
    renderWithLocale(<PlanetListExample planet={planet} />);
    const checkbox = screen.getByRole("checkbox", { name: "Visited" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
