// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PlanetActiveFilters,
  PlanetFilters,
  emptyPlanetFilterOptions,
  emptyPlanetFilterValues,
  hasActivePlanetFilters,
  type PlanetFilterOptions,
  type PlanetFilterValues,
} from "@/components/forms/planet-filters";
import { translateAlmanacValue } from "@/lib/translations";
import { renderWithLocale, tr } from "../helpers";

const options: PlanetFilterOptions = {
  economy: ["Trading"],
  economyStars: [1, 3],
  star: ["Yellow"],
  race: ["Gek"],
  planetType: ["Lush"],
  size: ["Large"],
  water: ["Yes"],
  weather: ["Calm"],
  conflict: ["Low"],
  sentinels: ["Aggressive"],
  plants: ["Faecium"],
  minerals: ["Copper"],
  valuables: ["Gold"],
};

function renderFilters(props: Partial<Parameters<typeof PlanetFilters>[0]> = {}) {
  const onChange = vi.fn();
  const onSearchChange = vi.fn();
  const onToggle = vi.fn();
  const view = renderWithLocale(
    <PlanetFilters
      hasActiveFilters={false}
      onChange={onChange}
      onSearchChange={onSearchChange}
      onToggle={onToggle}
      open
      options={options}
      search=""
      values={emptyPlanetFilterValues}
      {...props}
    />,
  );
  return { ...view, onChange, onSearchChange, onToggle };
}

describe("hasActivePlanetFilters", () => {
  it("treats economyStars as active only when it is not null", () => {
    expect(hasActivePlanetFilters(emptyPlanetFilterValues)).toBe(false);
    expect(hasActivePlanetFilters({ ...emptyPlanetFilterValues, economyStars: 0 })).toBe(true);
    expect(hasActivePlanetFilters({ ...emptyPlanetFilterValues, water: "Yes" })).toBe(true);
  });
});

describe("PlanetFilters", () => {
  it("forwards search input and toggles the panel", async () => {
    const { user, onSearchChange, onToggle } = renderFilters({ open: false, search: undefined as unknown as string });
    const search = screen.getByRole("searchbox", { name: tr("planet.search_almanac_values") });
    expect(search).toHaveValue("");
    await user.type(search, "x");
    expect(onSearchChange).toHaveBeenCalledWith("x");

    const toggle = screen.getByRole("button", { name: tr("planet.filters") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("data-active");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("marks the toggle active when filters are applied", () => {
    renderFilters({ hasActiveFilters: true });
    const toggle = screen.getByRole("button", { name: tr("planet.filters") });
    expect(toggle).toHaveAttribute("data-active", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it.each([
    ["planet.filter_planet_type", "planetType", "Lush"],
    ["planet.filter_star", "star", "Yellow"],
    ["planet.filter_economy", "economy", "Trading"],
    ["planet.filter_race", "race", "Gek"],
    ["planet.filter_size", "size", "Large"],
    ["planet.filter_dissonant", "dissonant", "yes"],
    ["planet.filter_paradise", "paradise", "no"],
    ["planet.filter_pirate_system", "pirate", "yes"],
    ["planet.filter_water", "water", "Yes"],
    ["planet.filter_weather", "weather", "Calm"],
    ["planet.filter_conflict", "conflict", "Low"],
    ["planet.filter_sentinels", "sentinels", "Aggressive"],
    ["planet.filter_plants", "plant", "Faecium"],
    ["planet.filter_minerals", "mineral", "Copper"],
    ["planet.filter_valuables", "valuable", "Gold"],
  ] as const)("changes %s", async (labelKey, field, value) => {
    const { user, onChange } = renderFilters();
    const select = screen.getByRole("combobox", { name: tr(labelKey) });
    expect(select).toHaveValue("");
    await user.selectOptions(select, value);
    expect(onChange).toHaveBeenCalledWith(field, value);
  });

  it("lists translated option values", () => {
    renderFilters();
    const select = screen.getByRole("combobox", { name: tr("planet.filter_star") });
    expect(within(select).getByRole("option", { name: translateAlmanacValue("en", "Yellow") })).toHaveValue("Yellow");
  });

  it("converts economy stars to numbers and back to null", async () => {
    const { user, onChange } = renderFilters({ values: { ...emptyPlanetFilterValues, economyStars: 1 } });
    const select = screen.getByRole("combobox", { name: tr("planet.filter_economy_stars") });
    expect(select).toHaveValue("1");
    expect(within(select).getByRole("option", { name: "★☆☆" })).toHaveValue("1");
    expect(within(select).getByRole("option", { name: "★★★" })).toHaveValue("3");
    await user.selectOptions(select, "3");
    expect(onChange).toHaveBeenLastCalledWith("economyStars", 3);
    await user.selectOptions(select, "");
    expect(onChange).toHaveBeenLastCalledWith("economyStars", null);
  });

  it("renders only the empty choice when no options are known", () => {
    renderFilters({ options: emptyPlanetFilterOptions });
    const select = screen.getByRole("combobox", { name: tr("planet.filter_water") });
    expect(within(select).getAllByRole("option")).toHaveLength(1);
  });
});

describe("PlanetActiveFilters", () => {
  const allValues: PlanetFilterValues = {
    economy: "Trading",
    economyStars: 2,
    star: "Yellow",
    race: "Gek",
    planetType: "Lush",
    size: "Large",
    dissonant: "yes",
    paradise: "no",
    pirate: "yes",
    water: "Yes",
    weather: "Calm",
    sentinels: "Aggressive",
    conflict: "Low",
    plant: "Faecium",
    mineral: "Copper",
    valuable: "Gold",
  };
  const tv = (value: string) => translateAlmanacValue("en", value);

  it("renders nothing without active filters", () => {
    const { container } = renderWithLocale(
      <PlanetActiveFilters onChange={vi.fn()} onReset={vi.fn()} values={emptyPlanetFilterValues} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a removable tag per active filter and resets them all", async () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const { user } = renderWithLocale(<PlanetActiveFilters onChange={onChange} onReset={onReset} values={allValues} />);
    const expected: Array<[string, keyof PlanetFilterValues, string | null]> = [
      [`${tr("common.economy")}: ${tv("Trading")}`, "economy", ""],
      [`${tr("planet.economy_stars")}: ★★☆`, "economyStars", null],
      [`${tr("planet.star_type")}: ${tv("Yellow")}`, "star", ""],
      [`${tr("common.race")}: ${tv("Gek")}`, "race", ""],
      [`${tr("planet.planet_type")}: ${tv("Lush")}`, "planetType", ""],
      [`${tr("planet.size")}: ${tv("Large")}`, "size", ""],
      [`${tr("planet.dissonant")}: ${tr("planet.dissonant_yes")}`, "dissonant", ""],
      [`${tr("planet.paradise")}: ${tr("planet.dissonant_no")}`, "paradise", ""],
      [`${tr("planet.pirate_system")}: ${tr("planet.dissonant_yes")}`, "pirate", ""],
      [`${tr("planet.water")}: ${tv("Yes")}`, "water", ""],
      [`${tr("planet.weather")}: ${tv("Calm")}`, "weather", ""],
      [`${tr("common.conflict")}: ${tv("Low")}`, "conflict", ""],
      [`${tr("planet.sentinels")}: ${tv("Aggressive")}`, "sentinels", ""],
      [`${tr("common.plants")}: ${tv("Faecium")}`, "plant", ""],
      [`${tr("common.minerals")}: ${tv("Copper")}`, "mineral", ""],
      [`${tr("common.valuables")}: ${tv("Gold")}`, "valuable", ""],
    ];
    for (const [label, field, cleared] of expected) {
      await user.click(screen.getByRole("button", { name: `${tr("planet.remove_filter")}: ${label}` }));
      expect(onChange).toHaveBeenLastCalledWith(field, cleared);
    }
    expect(onChange).toHaveBeenCalledTimes(expected.length);
    await user.click(screen.getByRole("button", { name: tr("planet.reset_filters") }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("labels the opposite yes/no answers", () => {
    renderWithLocale(
      <PlanetActiveFilters
        onChange={vi.fn()}
        onReset={vi.fn()}
        values={{ ...emptyPlanetFilterValues, dissonant: "no", paradise: "yes", pirate: "no", economyStars: 0 }}
      />,
    );
    expect(screen.getByText(`${tr("planet.dissonant")}: ${tr("planet.dissonant_no")}`)).toBeInTheDocument();
    expect(screen.getByText(`${tr("planet.paradise")}: ${tr("planet.dissonant_yes")}`)).toBeInTheDocument();
    expect(screen.getByText(`${tr("planet.pirate_system")}: ${tr("planet.dissonant_no")}`)).toBeInTheDocument();
    expect(screen.getByText(`${tr("planet.economy_stars")}: ☆☆☆`)).toBeInTheDocument();
  });
});
