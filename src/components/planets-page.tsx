"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Globe2, Orbit, Search } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
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
  galaxy: number;
  title?: string;
  description?: string;
  system?: string;
  imageUrl?: string;
  almanacName?: string;
  almanacSearchIndex: string;
  almanacFacts: { label: string; value: string }[];
  systemFacts: { label: string; value: string }[];
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
  const { t } = useLocale();
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetDestination | null>(null);
  const [search, setSearch] = useState("");
  const sortedPlanets = useMemo(() => [...planets].sort((a, b) =>
    (a.system ?? "").localeCompare(b.system ?? "", undefined, { sensitivity: "base" }) ||
    (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" }) ||
    a.portal.localeCompare(b.portal),
  ), [planets]);
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
  const visiblePlanetGroups = useMemo(() => {
    if (!searchQuery) return planetGroups;
    return planetGroups.flatMap((group) => {
      const matchingPlanets = group.planets.filter((planet) => planetMatchesSearch(planet, searchQuery));
      if (matchingPlanets.length > 0) return [{ ...group, planets: matchingPlanets }];
      return group.station?.name?.toLocaleLowerCase().includes(searchQuery) ? [group] : [];
    });
  }, [planetGroups, searchQuery]);
  const filteredPlanets = visiblePlanetGroups.flatMap((group) => group.planets);

  return (
    <div className="app-shell">
      <AllianceSidebar
        activeSection="pianeti"
        currentMember={currentMember}
        missionCount={missionCount}
        stationCount={stationCount}
        offlineCount={offlineCount}
        userCount={userCount}
        settings={alliance}
      />
      <section className="main-panel">
        <DashboardTopbar currentMember={currentMember} sectionTitle="navigation.planets" settings={alliance} />
        <MissionHero description={t("planet.missions_planets_description")} settings={alliance} title={t("navigation.planets")} />
        <main className="content-wrap planets-page">
          {almanacLookupFailed && <p className="form-error">{t("planet.almanac_partial_lookup_failed")}</p>}
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
          {filteredPlanets.length === 0
            ? <p className="station-list-empty">{t(search.trim() ? "planet.no_planets_match_search" : almanacLookupFailed ? "planet.no_verified_mission_planets" : "planet.no_mission_planets")}</p>
            : <div className="planet-station-groups">{visiblePlanetGroups.map(({ station, planets: groupPlanets }) => <section className="planet-station-group" key={station?.id ?? "unassociated"}>
              <div className="planet-station-heading">
                <div>
                  <h2>{station?.name || t(station ? "stations.space_station" : "planet.no_associated_station")}</h2>
                  {station && <p className="planet-station-address">{galaxyLabel(station.galaxy)} · {station.portal}</p>}
                  {groupPlanets[0]?.systemFacts.length > 0 && <div className="planet-station-facts">
                    {groupPlanets[0].systemFacts.map((fact) => <span key={fact.label}><b>{t(fact.label)}</b> {fact.value}</span>)}
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
                      <span key={fact.label}><b>{t(fact.label)}</b> {fact.value}</span>,
                    )}</span>}
                  </span>
                </button>
              </li>)}</ul>
            </section>)}</div>}
        </main>
      </section>
      {selectedPlanet && <PlanetCard
        contextLabel={selectedPlanet.system}
        missionDescription={selectedPlanet.description}
        galaxy={selectedPlanet.galaxy}
        key={selectedPlanet.id}
        initialPlanetPortal={selectedPlanet.planetPortal}
        onClose={() => setSelectedPlanet(null)}
        portal={selectedPlanet.portal}
        title={selectedPlanet.title ?? t("planet.mission_planet")}
      />}
    </div>
  );
}
