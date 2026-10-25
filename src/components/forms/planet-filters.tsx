"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import type { SystemFeature } from "@/lib/planets/system-feature";

const featureLabels: Record<SystemFeature, string> = {
  "gas-giant": "system.gas_giant",
  atlas: "system.atlas_interface",
  "black-hole": "system.black_hole",
};

export type PlanetFilterValues = Readonly<{
  economy: string;
  economyStars: number | null;
  wealth: string;
  star: string;
  race: string;
  planetType: string;
  size: string;
  dissonant: string;
  paradise: string;
  pirate: string;
  feature: string;
  visited: string;
  water: string;
  weather: string;
  sentinels: string;
  conflict: string;
  plant: string;
  mineral: string;
  valuable: string;
}>;

export type PlanetFilterOptions = Readonly<{
  economy: string[];
  economyStars: number[];
  wealth: string[];
  star: string[];
  race: string[];
  planetType: string[];
  size: string[];
  water: string[];
  weather: string[];
  conflict: string[];
  sentinels: string[];
  plants: string[];
  minerals: string[];
  valuables: string[];
  features: SystemFeature[];
  visitable: boolean;
}>;

export const emptyPlanetFilterValues: PlanetFilterValues = {
  economy: "",
  economyStars: null,
  wealth: "",
  star: "",
  race: "",
  planetType: "",
  size: "",
  dissonant: "",
  paradise: "",
  pirate: "",
  feature: "",
  visited: "",
  water: "",
  weather: "",
  sentinels: "",
  conflict: "",
  plant: "",
  mineral: "",
  valuable: "",
};

export const emptyPlanetFilterOptions: PlanetFilterOptions = {
  economy: [],
  economyStars: [],
  wealth: [],
  star: [],
  race: [],
  planetType: [],
  size: [],
  water: [],
  weather: [],
  conflict: [],
  sentinels: [],
  plants: [],
  minerals: [],
  valuables: [],
  features: [],
  visitable: false,
};

export function hasActivePlanetFilters(values: PlanetFilterValues) {
  return Object.entries(values).some(([key, value]) => (key === "economyStars" ? value !== null : Boolean(value)));
}

type PlanetFiltersProps = Readonly<{
  options: PlanetFilterOptions;
  values: PlanetFilterValues;
  onChange: <K extends keyof PlanetFilterValues>(key: K, value: PlanetFilterValues[K]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
  hasActiveFilters: boolean;
}>;

export function PlanetFilters({
  options,
  values,
  onChange,
  search,
  onSearchChange,
  open,
  onToggle,
  hasActiveFilters,
}: PlanetFiltersProps) {
  const { t, tv } = useLocale();

  return (
    <>
      <div className="planet-search-row">
        <label className="search-field planet-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label={t("planet.search_almanac_values")}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("planet.search_almanac_values")}
            type="search"
            value={search ?? ""}
          />
        </label>
        <button
          aria-controls="planet-filters-panel"
          aria-expanded={open}
          aria-label={t("planet.filters")}
          className="planet-filters-toggle"
          data-active={hasActiveFilters || undefined}
          data-tooltip={t("planet.filters")}
          onClick={onToggle}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" size={14} />
        </button>
      </div>
      {open && (
        <div className="planet-controls" id="planet-filters-panel">
          <label className="planet-filter">
            <span>{t("planet.planet_type")}</span>
            <select
              aria-label={t("planet.filter_planet_type")}
              onChange={(event) => onChange("planetType", event.target.value)}
              value={values.planetType}
            >
              <option value="">{t("planet.all_planet_types")}</option>
              {options.planetType.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.star_type")}</span>
            <select
              aria-label={t("planet.filter_star")}
              onChange={(event) => onChange("star", event.target.value)}
              value={values.star}
            >
              <option value="">{t("planet.all_stars")}</option>
              {options.star.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.economy")}</span>
            <select
              aria-label={t("planet.filter_economy")}
              onChange={(event) => onChange("economy", event.target.value)}
              value={values.economy}
            >
              <option value="">{t("planet.all_economies")}</option>
              {options.economy.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.economy_stars")}</span>
            <select
              aria-label={t("planet.filter_economy_stars")}
              onChange={(event) => onChange("economyStars", event.target.value ? Number(event.target.value) : null)}
              value={values.economyStars === null ? "" : String(values.economyStars)}
            >
              <option value="">{t("planet.all_economy_stars")}</option>
              {options.economyStars.map((count) => (
                <option key={count} value={count}>
                  {"★".repeat(count)}
                  {"☆".repeat(3 - count)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.wealth")}</span>
            <select
              aria-label={t("planet.filter_wealth")}
              onChange={(event) => onChange("wealth", event.target.value)}
              value={values.wealth}
            >
              <option value="">{t("planet.all_wealth")}</option>
              {options.wealth.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.race")}</span>
            <select
              aria-label={t("planet.filter_race")}
              onChange={(event) => onChange("race", event.target.value)}
              value={values.race}
            >
              <option value="">{t("planet.all_races")}</option>
              {options.race.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.size")}</span>
            <select
              aria-label={t("planet.filter_size")}
              onChange={(event) => onChange("size", event.target.value)}
              value={values.size}
            >
              <option value="">{t("planet.all_sizes")}</option>
              {options.size.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.dissonant")}</span>
            <select
              aria-label={t("planet.filter_dissonant")}
              onChange={(event) => onChange("dissonant", event.target.value)}
              value={values.dissonant}
            >
              <option value="">{t("planet.all_dissonant")}</option>
              <option value="yes">{t("planet.dissonant_yes")}</option>
              <option value="no">{t("planet.dissonant_no")}</option>
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.paradise")}</span>
            <select
              aria-label={t("planet.filter_paradise")}
              onChange={(event) => onChange("paradise", event.target.value)}
              value={values.paradise}
            >
              <option value="">{t("planet.all_dissonant")}</option>
              <option value="yes">{t("planet.dissonant_yes")}</option>
              <option value="no">{t("planet.dissonant_no")}</option>
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.pirate_system")}</span>
            <select
              aria-label={t("planet.filter_pirate_system")}
              onChange={(event) => onChange("pirate", event.target.value)}
              value={values.pirate}
            >
              <option value="">{t("planet.all_dissonant")}</option>
              <option value="yes">{t("planet.dissonant_yes")}</option>
              <option value="no">{t("planet.dissonant_no")}</option>
            </select>
          </label>
          {options.visitable && (
            <label className="planet-filter">
              <span>{t("planet.visited_by_me")}</span>
              <select
                aria-label={t("planet.filter_visited")}
                onChange={(event) => onChange("visited", event.target.value)}
                value={values.visited}
              >
                <option value="">{t("planet.all_visited")}</option>
                <option value="yes">{t("planet.visited_yes")}</option>
                <option value="no">{t("planet.visited_no")}</option>
              </select>
            </label>
          )}
          <label className="planet-filter">
            <span>{t("planet.special_system")}</span>
            <select
              aria-label={t("planet.filter_special_system")}
              onChange={(event) => onChange("feature", event.target.value)}
              value={values.feature}
            >
              <option value="">{t("planet.all_special_systems")}</option>
              {options.features.map((value) => (
                <option key={value} value={value}>
                  {t(featureLabels[value])}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.water")}</span>
            <select
              aria-label={t("planet.filter_water")}
              onChange={(event) => onChange("water", event.target.value)}
              value={values.water}
            >
              <option value="">{t("planet.all_water")}</option>
              {options.water.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.weather")}</span>
            <select
              aria-label={t("planet.filter_weather")}
              onChange={(event) => onChange("weather", event.target.value)}
              value={values.weather}
            >
              <option value="">{t("planet.all_weather")}</option>
              {options.weather.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.conflict")}</span>
            <select
              aria-label={t("planet.filter_conflict")}
              onChange={(event) => onChange("conflict", event.target.value)}
              value={values.conflict}
            >
              <option value="">{t("planet.all_conflicts")}</option>
              {options.conflict.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("planet.sentinels")}</span>
            <select
              aria-label={t("planet.filter_sentinels")}
              onChange={(event) => onChange("sentinels", event.target.value)}
              value={values.sentinels}
            >
              <option value="">{t("planet.all_sentinels")}</option>
              {options.sentinels.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.plants")}</span>
            <select
              aria-label={t("planet.filter_plants")}
              onChange={(event) => onChange("plant", event.target.value)}
              value={values.plant}
            >
              <option value="">{t("planet.all_plants")}</option>
              {options.plants.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.minerals")}</span>
            <select
              aria-label={t("planet.filter_minerals")}
              onChange={(event) => onChange("mineral", event.target.value)}
              value={values.mineral}
            >
              <option value="">{t("planet.all_minerals")}</option>
              {options.minerals.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="planet-filter">
            <span>{t("common.valuables")}</span>
            <select
              aria-label={t("planet.filter_valuables")}
              onChange={(event) => onChange("valuable", event.target.value)}
              value={values.valuable}
            >
              <option value="">{t("planet.all_valuables")}</option>
              {options.valuables.map((value) => (
                <option key={value} value={value}>
                  {tv(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  );
}

export function PlanetActiveFilters({
  values,
  onChange,
  onReset,
}: Readonly<{
  values: PlanetFilterValues;
  onChange: PlanetFiltersProps["onChange"];
  onReset: () => void;
}>) {
  const { t, tv } = useLocale();
  const activeFilterTags = [
    values.economy && {
      key: "economy",
      label: `${t("common.economy")}: ${tv(values.economy)}`,
      clear: () => onChange("economy", ""),
    },
    values.economyStars !== null && {
      key: "economyStars",
      label: `${t("planet.economy_stars")}: ${"★".repeat(values.economyStars)}${"☆".repeat(3 - values.economyStars)}`,
      clear: () => onChange("economyStars", null),
    },
    values.wealth && {
      key: "wealth",
      label: `${t("planet.wealth")}: ${tv(values.wealth)}`,
      clear: () => onChange("wealth", ""),
    },
    values.star && {
      key: "star",
      label: `${t("planet.star_type")}: ${tv(values.star)}`,
      clear: () => onChange("star", ""),
    },
    values.race && { key: "race", label: `${t("common.race")}: ${tv(values.race)}`, clear: () => onChange("race", "") },
    values.planetType && {
      key: "planetType",
      label: `${t("planet.planet_type")}: ${tv(values.planetType)}`,
      clear: () => onChange("planetType", ""),
    },
    values.size && { key: "size", label: `${t("planet.size")}: ${tv(values.size)}`, clear: () => onChange("size", "") },
    values.dissonant && {
      key: "dissonant",
      label: `${t("planet.dissonant")}: ${t(values.dissonant === "yes" ? "planet.dissonant_yes" : "planet.dissonant_no")}`,
      clear: () => onChange("dissonant", ""),
    },
    values.paradise && {
      key: "paradise",
      label: `${t("planet.paradise")}: ${t(values.paradise === "yes" ? "planet.dissonant_yes" : "planet.dissonant_no")}`,
      clear: () => onChange("paradise", ""),
    },
    values.pirate && {
      key: "pirate",
      label: `${t("planet.pirate_system")}: ${t(values.pirate === "yes" ? "planet.dissonant_yes" : "planet.dissonant_no")}`,
      clear: () => onChange("pirate", ""),
    },
    values.visited && {
      key: "visited",
      label: `${t("planet.visited_by_me")}: ${t(values.visited === "yes" ? "planet.visited_yes" : "planet.visited_no")}`,
      clear: () => onChange("visited", ""),
    },
    values.feature && {
      key: "feature",
      label: `${t("planet.special_system")}: ${t(featureLabels[values.feature as SystemFeature])}`,
      clear: () => onChange("feature", ""),
    },
    values.water && {
      key: "water",
      label: `${t("planet.water")}: ${tv(values.water)}`,
      clear: () => onChange("water", ""),
    },
    values.weather && {
      key: "weather",
      label: `${t("planet.weather")}: ${tv(values.weather)}`,
      clear: () => onChange("weather", ""),
    },
    values.conflict && {
      key: "conflict",
      label: `${t("common.conflict")}: ${tv(values.conflict)}`,
      clear: () => onChange("conflict", ""),
    },
    values.sentinels && {
      key: "sentinels",
      label: `${t("planet.sentinels")}: ${tv(values.sentinels)}`,
      clear: () => onChange("sentinels", ""),
    },
    values.plant && {
      key: "plant",
      label: `${t("common.plants")}: ${tv(values.plant)}`,
      clear: () => onChange("plant", ""),
    },
    values.mineral && {
      key: "mineral",
      label: `${t("common.minerals")}: ${tv(values.mineral)}`,
      clear: () => onChange("mineral", ""),
    },
    values.valuable && {
      key: "valuable",
      label: `${t("common.valuables")}: ${tv(values.valuable)}`,
      clear: () => onChange("valuable", ""),
    },
  ].filter((tag): tag is { key: string; label: string; clear: () => void } => Boolean(tag));

  if (activeFilterTags.length === 0) return null;

  return (
    <div className="planet-active-filters">
      {activeFilterTags.map((tag) => (
        <span className="planet-filter-tag" key={tag.key}>
          {tag.label}
          <button aria-label={`${t("planet.remove_filter")}: ${tag.label}`} onClick={tag.clear} type="button">
            <X aria-hidden="true" size={11} />
          </button>
        </span>
      ))}
      <button
        aria-label={t("planet.reset_filters")}
        className="planet-reset-filters"
        data-tooltip={t("planet.reset_filters")}
        onClick={onReset}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
