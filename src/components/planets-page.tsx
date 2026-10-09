"use client";

import { useEffect, useMemo, useState } from "react";
import { sortByCreatedAtDescending } from "@/lib/created-at";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Globe2, Orbit, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero, storePlanetCount } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { PlanetCard } from "@/components/planet-card";
import { GlyphStrip } from "@/components/portal-address-field";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";
import { useLocale } from "@/components/locale-provider";

type PlanetDestination = Readonly<{
  id: string;
  portal: string;
  planetPortal: string;
  planetNumber: number;
  createdAt?: string;
  galaxy: number;
  title?: string;
  description?: string;
  system?: string;
  systemLabelFromAlmanac?: boolean;
  imageUrl?: string;
  almanacName?: string;
  almanacSearchIndex: string;
  almanacFacts: { label: string; value: string }[];
  systemFacts: { label: string; value: string }[];
  planetType?: string;
  economyStars?: number;
  plants: string[];
  minerals: string[];
  valuables: string[];
  dissonant: boolean;
  station?: Readonly<{
    id: string;
    portal: string;
    galaxy: number;
    name?: string;
  }>;
}>;

function planetMatchesSearch(planet: PlanetDestination, query: string) {
  return `${planet.almanacSearchIndex} ${planet.planetPortal} ${planet.almanacName ?? ""}`
    .toLocaleLowerCase()
    .includes(query);
}

function almanacFactValue(planet: PlanetDestination, label: string) {
  return planet.almanacFacts.find((fact) => fact.label === label)?.value;
}

function sizeValue(planet: PlanetDestination) {
  return almanacFactValue(planet, "planet.size");
}

function waterValue(planet: PlanetDestination) {
  return almanacFactValue(planet, "planet.water");
}

function weatherValue(planet: PlanetDestination) {
  return almanacFactValue(planet, "planet.weather");
}

function sentinelsValue(planet: PlanetDestination) {
  return almanacFactValue(planet, "planet.sentinels");
}

function systemFactValue(planet: PlanetDestination, label: string) {
  return planet.systemFacts.find((fact) => fact.label === label)?.value;
}

export function PlanetsPage({ alliance, currentMember, planets, almanacLookupFailed, missionCount, stationCount, offlineCount, userCount }: Readonly<{
  alliance: AllianceSettings;
  currentMember: AllianceMember;
  planets: PlanetDestination[];
  almanacLookupFailed: boolean;
  missionCount: number;
  stationCount: number;
  offlineCount?: number;
  userCount?: number;
}>) {
  const { t, tv, systemLabel } = useLocale();
  useEffect(() => {
    if (!almanacLookupFailed) storePlanetCount(planets.length);
  }, [almanacLookupFailed, planets.length]);
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetDestination | null>(null);
  const [search, setSearch] = useState("");
  const [economy, setEconomy] = useState("");
  const [star, setStar] = useState("");
  const [race, setRace] = useState("");
  const [planetType, setPlanetType] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [size, setSize] = useState("");
  const [dissonant, setDissonant] = useState("");
  const [water, setWater] = useState("");
  const [weather, setWeather] = useState("");
  const [sentinels, setSentinels] = useState("");
  const [conflict, setConflict] = useState("");
  const [plant, setPlant] = useState("");
  const [mineral, setMineral] = useState("");
  const [valuable, setValuable] = useState("");
  const [economyStars, setEconomyStars] = useState<number | null>(null);
  const sortedPlanets = useMemo(() => sortByCreatedAtDescending([...planets].sort((a, b) =>
    (a.system ?? "").localeCompare(b.system ?? "", undefined, { sensitivity: "base" }) ||
    (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" }) ||
    a.portal.localeCompare(b.portal),
  )), [planets]);
  const filterOptions = useMemo(() => ({
    economy: [...new Set(planets.map((planet) => systemFactValue(planet, "common.economy")).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    economyStars: [...new Set(planets.map((planet) => planet.economyStars).filter((value): value is number => value !== undefined))]
      .sort((a, b) => a - b),
    star: [...new Set(planets.map((planet) => systemFactValue(planet, "planet.star")).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    race: [...new Set(planets.map((planet) => systemFactValue(planet, "common.race")).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    planetType: [...new Set(planets.map((planet) => planet.planetType).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    size: [...new Set(planets.map(sizeValue).filter((value): value is string => Boolean(value)))],
    water: [...new Set(planets.map(waterValue).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    weather: [...new Set(planets.map(weatherValue).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    conflict: [...new Set(planets.map((planet) => systemFactValue(planet, "common.conflict")).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    sentinels: [...new Set(planets.map(sentinelsValue).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    plants: [...new Set(planets.flatMap((planet) => planet.plants))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    minerals: [...new Set(planets.flatMap((planet) => planet.minerals))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    valuables: [...new Set(planets.flatMap((planet) => planet.valuables))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  }), [planets]);
  const searchQuery = search.trim().toLocaleLowerCase();
  const planetGroups = useMemo(() => {
    const groups = new Map<string, { station: PlanetDestination["station"]; planets: PlanetDestination[] }>();
    for (const planet of sortedPlanets) {
      const key = planet.station?.id ?? "unassociated";
      const group = groups.get(key) ?? { station: planet.station, planets: [] };
      group.planets.push(planet);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [sortedPlanets]);
  const filteredPlanetGroups = useMemo(() => planetGroups.flatMap((group) => {
    const matchingPlanets = group.planets.filter((planet) =>
      (!economy || systemFactValue(planet, "common.economy") === economy) &&
      (economyStars === null || planet.economyStars === economyStars) &&
      (!star || systemFactValue(planet, "planet.star") === star) &&
      (!race || systemFactValue(planet, "common.race") === race) &&
      (!planetType || planet.planetType === planetType) &&
      (!size || sizeValue(planet) === size) &&
      (!dissonant || planet.dissonant === (dissonant === "yes")) &&
      (!water || waterValue(planet) === water) &&
      (!weather || weatherValue(planet) === weather) &&
      (!conflict || systemFactValue(planet, "common.conflict") === conflict) &&
      (!sentinels || sentinelsValue(planet) === sentinels) &&
      (!plant || planet.plants.includes(plant)) &&
      (!mineral || planet.minerals.includes(mineral)) &&
      (!valuable || planet.valuables.includes(valuable)),
    );
    return matchingPlanets.length > 0 ? [{ ...group, planets: matchingPlanets }] : [];
  }), [economy, economyStars, mineral, plant, planetGroups, planetType, race, star, valuable, size, dissonant, water, weather, sentinels, conflict]);
  const visiblePlanetGroups = useMemo(() => {
    if (!searchQuery) return filteredPlanetGroups;
    return filteredPlanetGroups.flatMap((group) => {
      const matchingPlanets = group.planets.filter((planet) => planetMatchesSearch(planet, searchQuery));
      if (matchingPlanets.length > 0) return [{ ...group, planets: matchingPlanets }];
      return group.station?.name?.toLocaleLowerCase().includes(searchQuery) ? [group] : [];
    });
  }, [filteredPlanetGroups, searchQuery]);
  const filteredPlanets = visiblePlanetGroups.flatMap((group) => group.planets);
  const hasActiveFilters = Boolean(economy || economyStars !== null || star || race || planetType || size || dissonant || water || weather || sentinels || conflict || plant || mineral || valuable);
  const activeFilterTags = [
    economy && { key: "economy", label: `${t("common.economy")}: ${tv(economy)}`, clear: () => setEconomy("") },
    economyStars !== null && { key: "economyStars", label: `${t("planet.economy_stars")}: ${"★".repeat(economyStars)}${"☆".repeat(3 - economyStars)}`, clear: () => setEconomyStars(null) },
    star && { key: "star", label: `${t("planet.star_type")}: ${tv(star)}`, clear: () => setStar("") },
    race && { key: "race", label: `${t("common.race")}: ${tv(race)}`, clear: () => setRace("") },
    planetType && { key: "planetType", label: `${t("planet.planet_type")}: ${tv(planetType)}`, clear: () => setPlanetType("") },
    size && { key: "size", label: `${t("planet.size")}: ${tv(size)}`, clear: () => setSize("") },
    dissonant && { key: "dissonant", label: `${t("planet.dissonant")}: ${t(dissonant === "yes" ? "planet.dissonant_yes" : "planet.dissonant_no")}`, clear: () => setDissonant("") },
    water && { key: "water", label: `${t("planet.water")}: ${tv(water)}`, clear: () => setWater("") },
    weather && { key: "weather", label: `${t("planet.weather")}: ${tv(weather)}`, clear: () => setWeather("") },
    conflict && { key: "conflict", label: `${t("common.conflict")}: ${tv(conflict)}`, clear: () => setConflict("") },
    sentinels && { key: "sentinels", label: `${t("planet.sentinels")}: ${tv(sentinels)}`, clear: () => setSentinels("") },
    plant && { key: "plant", label: `${t("common.plants")}: ${tv(plant)}`, clear: () => setPlant("") },
    mineral && { key: "mineral", label: `${t("common.minerals")}: ${tv(mineral)}`, clear: () => setMineral("") },
    valuable && { key: "valuable", label: `${t("common.valuables")}: ${tv(valuable)}`, clear: () => setValuable("") },
  ].filter((tag): tag is { key: string; label: string; clear: () => void } => Boolean(tag));
  const resetFilters = () => {
    setEconomy("");
    setEconomyStars(null);
    setStar("");
    setRace("");
    setPlanetType("");
    setSize("");
    setDissonant("");
    setWater("");
    setWeather("");
    setSentinels("");
    setConflict("");
    setPlant("");
    setMineral("");
    setValuable("");
  };
  const hasActiveCriteria = Boolean(searchQuery || hasActiveFilters);

  return (
    <div className="app-shell">
      <AllianceSidebar
        activeSection="pianeti"
        currentMember={pageMember}
        missionCount={missionCount}
        stationCount={stationCount}
        planetCount={planets.length}
        offlineCount={offlineCount}
        userCount={userCount}
        settings={allianceSettings}
      />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="navigation.planets" settings={allianceSettings} />
        <MissionHero description={t("planet.missions_planets_description")} settings={allianceSettings} title={t("navigation.planets")} />
        <main className="content-wrap planets-page">
          {almanacLookupFailed && <p className="form-error">{t("planet.almanac_partial_lookup_failed")}</p>}
          <div className="planet-search-row">
            <label className="search-field planet-search">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label={t("planet.search_almanac_values")}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("planet.search_almanac_values")}
                type="search"
                value={search}
              />
            </label>
            <button
              aria-controls="planet-filters-panel"
              aria-expanded={filtersOpen}
              aria-label={t("planet.filters")}
              className="planet-filters-toggle"
              data-active={hasActiveFilters || undefined}
              data-tooltip={t("planet.filters")}
              onClick={() => setFiltersOpen((open) => !open)}
              type="button"
            ><SlidersHorizontal aria-hidden="true" size={14} /></button>
          </div>
          {filtersOpen && <div className="planet-controls" id="planet-filters-panel">
            <label className="planet-filter">
              <span>{t("planet.planet_type")}</span>
              <select aria-label={t("planet.filter_planet_type")} onChange={(event) => setPlanetType(event.target.value)} value={planetType}>
                <option value="">{t("planet.all_planet_types")}</option>
                {filterOptions.planetType.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.star_type")}</span>
              <select aria-label={t("planet.filter_star")} onChange={(event) => setStar(event.target.value)} value={star}>
                <option value="">{t("planet.all_stars")}</option>
                {filterOptions.star.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.economy")}</span>
              <select aria-label={t("planet.filter_economy")} onChange={(event) => setEconomy(event.target.value)} value={economy}>
                <option value="">{t("planet.all_economies")}</option>
                {filterOptions.economy.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.economy_stars")}</span>
              <select
                aria-label={t("planet.filter_economy_stars")}
                onChange={(event) => setEconomyStars(event.target.value ? Number(event.target.value) : null)}
                value={economyStars === null ? "" : String(economyStars)}
              >
                <option value="">{t("planet.all_economy_stars")}</option>
                {filterOptions.economyStars.map((count) => <option key={count} value={count}>
                  {"★".repeat(count)}{"☆".repeat(3 - count)}
                </option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.race")}</span>
              <select aria-label={t("planet.filter_race")} onChange={(event) => setRace(event.target.value)} value={race}>
                <option value="">{t("planet.all_races")}</option>
                {filterOptions.race.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.size")}</span>
              <select aria-label={t("planet.filter_size")} onChange={(event) => setSize(event.target.value)} value={size}>
                <option value="">{t("planet.all_sizes")}</option>
                {filterOptions.size.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.dissonant")}</span>
              <select aria-label={t("planet.filter_dissonant")} onChange={(event) => setDissonant(event.target.value)} value={dissonant}>
                <option value="">{t("planet.all_dissonant")}</option>
                <option value="yes">{t("planet.dissonant_yes")}</option>
                <option value="no">{t("planet.dissonant_no")}</option>
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.water")}</span>
              <select aria-label={t("planet.filter_water")} onChange={(event) => setWater(event.target.value)} value={water}>
                <option value="">{t("planet.all_water")}</option>
                {filterOptions.water.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.weather")}</span>
              <select aria-label={t("planet.filter_weather")} onChange={(event) => setWeather(event.target.value)} value={weather}>
                <option value="">{t("planet.all_weather")}</option>
                {filterOptions.weather.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.conflict")}</span>
              <select aria-label={t("planet.filter_conflict")} onChange={(event) => setConflict(event.target.value)} value={conflict}>
                <option value="">{t("planet.all_conflicts")}</option>
                {filterOptions.conflict.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("planet.sentinels")}</span>
              <select aria-label={t("planet.filter_sentinels")} onChange={(event) => setSentinels(event.target.value)} value={sentinels}>
                <option value="">{t("planet.all_sentinels")}</option>
                {filterOptions.sentinels.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.plants")}</span>
              <select aria-label={t("planet.filter_plants")} onChange={(event) => setPlant(event.target.value)} value={plant}>
                <option value="">{t("planet.all_plants")}</option>
                {filterOptions.plants.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.minerals")}</span>
              <select aria-label={t("planet.filter_minerals")} onChange={(event) => setMineral(event.target.value)} value={mineral}>
                <option value="">{t("planet.all_minerals")}</option>
                {filterOptions.minerals.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
            <label className="planet-filter">
              <span>{t("common.valuables")}</span>
              <select aria-label={t("planet.filter_valuables")} onChange={(event) => setValuable(event.target.value)} value={valuable}>
                <option value="">{t("planet.all_valuables")}</option>
                {filterOptions.valuables.map((value) => <option key={value} value={value}>{tv(value)}</option>)}
              </select>
            </label>
          </div>}
          {hasActiveFilters && <div className="planet-active-filters">
            {activeFilterTags.map((tag) => <span className="planet-filter-tag" key={tag.key}>
              {tag.label}
              <button aria-label={`${t("planet.remove_filter")}: ${tag.label}`} onClick={tag.clear} type="button"><X aria-hidden="true" size={11} /></button>
            </span>)}
            <button
              aria-label={t("planet.reset_filters")}
              className="planet-reset-filters"
              data-tooltip={t("planet.reset_filters")}
              onClick={resetFilters}
              type="button"
            ><RotateCcw aria-hidden="true" size={14} /></button>
          </div>}
          {filteredPlanets.length === 0
            ? <p className="station-list-empty">{t(hasActiveCriteria ? (hasActiveFilters && !searchQuery ? "planet.no_planets_match_filters" : "planet.no_planets_match_search") : almanacLookupFailed ? "planet.no_verified_mission_planets" : "planet.no_mission_planets")}</p>
            : <div className="planet-station-groups">{visiblePlanetGroups.map(({ station, planets: groupPlanets }) => <section className="planet-station-group" key={station?.id ?? "unassociated"}>
              <div className="planet-station-heading">
                <div>
                  <h2>{station?.name || t(station ? "stations.space_station" : "planet.no_associated_station")}</h2>
                  {station && <p className="planet-station-address"><span className={station.galaxy !== 0 ? "mission-galaxy-alert" : undefined} data-tooltip={station.galaxy !== 0 ? t("missions.galaxy_portals_warning") : undefined} tabIndex={station.galaxy !== 0 ? 0 : undefined}>{station.galaxy !== 0 && <AlertTriangle size={9} />}{galaxyLabel(station.galaxy)}</span> · {station.portal}</p>}
                  {groupPlanets[0]?.systemFacts.length > 0 && <div className="planet-station-facts">
                    {groupPlanets[0].systemFacts.map((fact) => <span key={fact.label}><b>{t(fact.label)}</b> {tv(fact.value)}</span>)}
                  </div>}
                </div>
                {station && <Link
                  aria-label={t("planet.open_station_in_stations", { station: station.name || station.portal })}
                  className="member-icon-action planet-station-link"
                  data-tooltip={t("planet.open_station_in_stations", { station: station.name || station.portal })}
                  href={`/stations?search=${encodeURIComponent(station.portal)}`}
                ><Orbit aria-hidden="true" size={15} /></Link>}
              </div>
              <ul className="planet-mission-list">{groupPlanets.map((planet) => <li key={planet.id}>
                <button className="planet-mission-card" onClick={() => setSelectedPlanet(planet)} type="button">
                  {planet.imageUrl
                    ? <Image alt="" className="planet-mission-image" height={96} src={planet.imageUrl} unoptimized width={96} />
                    : <Globe2 aria-hidden="true" className="planet-mission-icon" size={19} />}
                  <span className="planet-mission-card-copy">
                    <strong>{planet.almanacName || t("planet.planet_number", { number: planet.planetNumber })}</strong>
                    <GlyphStrip address={planet.planetPortal} />
                    <code>{planet.planetPortal}</code>
                    {planet.almanacFacts.length > 0 && <span className="planet-mission-facts">{planet.almanacFacts.map((fact) =>
                      <span key={fact.label}><b>{t(fact.label)}</b> {tv(fact.value)}</span>,
                    )}</span>}
                  </span>
                </button>
              </li>)}</ul>
            </section>)}</div>}
        </main>
      </section>
      {selectedPlanet && <PlanetCard
        contextLabel={selectedPlanet.system ? systemLabel({ system: selectedPlanet.system, systemLabelFromAlmanac: selectedPlanet.systemLabelFromAlmanac }) : undefined}
        missionDescription={selectedPlanet.description}
        galaxy={selectedPlanet.galaxy}
        key={selectedPlanet.id}
        initialPlanetPortal={selectedPlanet.planetPortal}
        onClose={() => setSelectedPlanet(null)}
        portal={selectedPlanet.portal}
        title={selectedPlanet.station?.name ?? selectedPlanet.title ?? t("planet.mission_planet")}
      />}
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} />}
    </div>
  );
}
