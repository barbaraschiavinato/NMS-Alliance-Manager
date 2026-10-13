"use client";

import { useEffect, useMemo, useState } from "react";
import { sortByCreatedAtDescending } from "@/lib/created-at";
import { Sidebar, storePlanetCount } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { PlanetList } from "@/components/sections/planet-list";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { PlanetCard } from "@/components/modals/planet-card";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/providers/locale-provider";
import {
  emptyPlanetFilterValues,
  hasActivePlanetFilters,
  PlanetActiveFilters,
  PlanetFilters,
  type PlanetFilterValues,
} from "@/components/forms/planet-filters";

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

export function PlanetsPage({
  alliance,
  currentMember,
  planets,
  almanacLookupFailed,
  missionCount,
  stationCount,
  offlineCount,
  userCount,
}: Readonly<{
  alliance: AllianceSettings;
  currentMember: AllianceMember;
  planets: PlanetDestination[];
  almanacLookupFailed: boolean;
  missionCount: number;
  stationCount: number;
  offlineCount?: number;
  userCount?: number;
}>) {
  const { t, systemLabel } = useLocale();
  const [renderedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!almanacLookupFailed) storePlanetCount(planets.length);
  }, [almanacLookupFailed, planets.length]);
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetDestination | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyPlanetFilterValues);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateFilter = <K extends keyof PlanetFilterValues>(key: K, value: PlanetFilterValues[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const sortedPlanets = useMemo(
    () =>
      sortByCreatedAtDescending(
        [...planets].sort(
          (a, b) =>
            (a.system ?? "").localeCompare(b.system ?? "", undefined, { sensitivity: "base" }) ||
            (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" }) ||
            a.portal.localeCompare(b.portal),
        ),
      ),
    [planets],
  );
  const filterOptions = useMemo(
    () => ({
      economy: [
        ...new Set(
          planets
            .map((planet) => systemFactValue(planet, "common.economy"))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      economyStars: [
        ...new Set(
          planets.map((planet) => planet.economyStars).filter((value): value is number => value !== undefined),
        ),
      ].sort((a, b) => a - b),
      star: [
        ...new Set(
          planets
            .map((planet) => systemFactValue(planet, "planet.star"))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      race: [
        ...new Set(
          planets
            .map((planet) => systemFactValue(planet, "common.race"))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      planetType: [
        ...new Set(planets.map((planet) => planet.planetType).filter((value): value is string => Boolean(value))),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      size: [...new Set(planets.map(sizeValue).filter((value): value is string => Boolean(value)))],
      water: [...new Set(planets.map(waterValue).filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
      weather: [...new Set(planets.map(weatherValue).filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
      conflict: [
        ...new Set(
          planets
            .map((planet) => systemFactValue(planet, "common.conflict"))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      sentinels: [...new Set(planets.map(sentinelsValue).filter((value): value is string => Boolean(value)))].sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
      plants: [...new Set(planets.flatMap((planet) => planet.plants))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
      minerals: [...new Set(planets.flatMap((planet) => planet.minerals))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
      valuables: [...new Set(planets.flatMap((planet) => planet.valuables))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    }),
    [planets],
  );
  const searchQuery = search.trim().toLocaleLowerCase();
  const planetGroups = useMemo(() => {
    const groups = new Map<string, { station: PlanetDestination["station"]; planets: PlanetDestination[] }>();
    for (const planet of sortedPlanets) {
      const key = planet.station?.id ?? "unassociated";
      const group = groups.get(key) ?? { station: planet.station, planets: [] };
      group.planets.push(planet);
      groups.set(key, group);
    }
    return sortByCreatedAtDescending(
      [...groups.values()].map((group) => ({ group, createdAt: group.station?.createdAt })),
    ).map(({ group }) => group);
  }, [sortedPlanets]);
  const filteredPlanetGroups = useMemo(
    () =>
      planetGroups.flatMap((group) => {
        const matchingPlanets = group.planets.filter(
          (planet) =>
            (!filters.economy || systemFactValue(planet, "common.economy") === filters.economy) &&
            (filters.economyStars === null || planet.economyStars === filters.economyStars) &&
            (!filters.star || systemFactValue(planet, "planet.star") === filters.star) &&
            (!filters.race || systemFactValue(planet, "common.race") === filters.race) &&
            (!filters.planetType || planet.planetType === filters.planetType) &&
            (!filters.size || sizeValue(planet) === filters.size) &&
            (!filters.dissonant || planet.dissonant === (filters.dissonant === "yes")) &&
            (!filters.paradise || planet.paradise === (filters.paradise === "yes")) &&
            (!filters.pirate || planet.blackMarket === (filters.pirate === "yes")) &&
            (!filters.water || waterValue(planet) === filters.water) &&
            (!filters.weather || weatherValue(planet) === filters.weather) &&
            (!filters.conflict || systemFactValue(planet, "common.conflict") === filters.conflict) &&
            (!filters.sentinels || sentinelsValue(planet) === filters.sentinels) &&
            (!filters.plant || planet.plants.includes(filters.plant)) &&
            (!filters.mineral || planet.minerals.includes(filters.mineral)) &&
            (!filters.valuable || planet.valuables.includes(filters.valuable)),
        );
        return matchingPlanets.length > 0 ? [{ ...group, planets: matchingPlanets }] : [];
      }),
    [filters, planetGroups],
  );
  const visiblePlanetGroups = useMemo(() => {
    if (!searchQuery) return filteredPlanetGroups;
    return filteredPlanetGroups.flatMap((group) => {
      const matchingPlanets = group.planets.filter((planet) => planetMatchesSearch(planet, searchQuery));
      if (matchingPlanets.length > 0) return [{ ...group, planets: matchingPlanets }];
      return group.station?.name?.toLocaleLowerCase().includes(searchQuery) ? [group] : [];
    });
  }, [filteredPlanetGroups, searchQuery]);
  const filteredPlanets = visiblePlanetGroups.flatMap((group) => group.planets);
  const hasActiveFilters = hasActivePlanetFilters(filters);
  const resetFilters = () => setFilters(emptyPlanetFilterValues);
  const hasActiveCriteria = Boolean(searchQuery || hasActiveFilters);

  return (
    <div className={`app-shell${pageMember.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
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
        <Header
          currentMember={pageMember}
          onAdminOpen={() => setAdminOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
          onProfileSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))}
          sectionTitle="navigation.planets"
          settings={allianceSettings}
        />
        <Hero
          settings={allianceSettings}
          subtitle={t("planet.missions_planets_description")}
          title={t("navigation.planets")}
        />
        <main className="content-wrap planets-page">
          {almanacLookupFailed && <p className="form-error">{t("planet.almanac_partial_lookup_failed")}</p>}
          <div className="planet-sticky-filters">
            <PlanetFilters
              hasActiveFilters={hasActiveFilters}
              onChange={updateFilter}
              onSearchChange={setSearch}
              onToggle={() => setFiltersOpen((open) => !open)}
              open={filtersOpen}
              options={filterOptions}
              search={search}
              values={filters}
            />
            <PlanetActiveFilters onChange={updateFilter} onReset={resetFilters} values={filters} />
          </div>
          {filteredPlanets.length === 0 ? (
            <p className="station-list-empty">
              {t(
                hasActiveCriteria
                  ? hasActiveFilters && !searchQuery
                    ? "planet.no_planets_match_filters"
                    : "planet.no_planets_match_search"
                  : almanacLookupFailed
                    ? "planet.no_verified_mission_planets"
                    : "planet.no_mission_planets",
              )}
            </p>
          ) : (
            <PlanetList renderedAt={renderedAt} groups={visiblePlanetGroups} onOpen={setSelectedPlanet} />
          )}
        </main>
      </section>
      {selectedPlanet && (
        <PlanetCard
          contextLabel={
            selectedPlanet.system
              ? systemLabel({
                  system: selectedPlanet.system,
                  systemLabelFromAlmanac: selectedPlanet.systemLabelFromAlmanac,
                })
              : undefined
          }
          missionDescription={selectedPlanet.description}
          galaxy={selectedPlanet.galaxy}
          key={selectedPlanet.id}
          initialPlanetPortal={selectedPlanet.planetPortal}
          onClose={() => setSelectedPlanet(null)}
          portal={selectedPlanet.portal}
          title={selectedPlanet.station?.name ?? selectedPlanet.title ?? t("planet.mission_planet")}
        />
      )}
      {adminOpen && pageMember.role === "admin" && (
        <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />
      )}
      {profileOpen && (
        <MemberProfilePanel
          member={pageMember}
          onClose={() => setProfileOpen(false)}
          onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))}
        />
      )}
    </div>
  );
}
