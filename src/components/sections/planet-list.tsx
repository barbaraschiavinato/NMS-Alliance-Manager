"use client";

import { type CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Orbit, Skull } from "lucide-react";
import { galaxyLabel } from "@/lib/galaxies";
import { PlanetDestinationCard, conflictLevels, type PlanetDestination } from "@/components/cards/planet-destination-card";
import { useLocale } from "@/components/providers/locale-provider";

const raceIcons: Record<string, string> = { Gek: "/icons/nms-gek.svg", Korvax: "/icons/nms-korvax.svg", "Vy’keen": "/icons/nms-vykeen.svg" };

export function PlanetList({ groups, renderedAt, onOpen }: Readonly<{
  renderedAt: number;
  groups: { station: PlanetDestination["station"]; planets: PlanetDestination[] }[];
  onOpen: (planet: PlanetDestination) => void;
}>) {
  const { t, tv } = useLocale();
  const isNewStation = (station: PlanetDestination["station"]) => {
    const createdTime = station?.createdAt ? Date.parse(station.createdAt) : Number.NaN;
    return Boolean(station) && !station?.hasMissions && Number.isFinite(createdTime) && renderedAt - createdTime < 7 * 24 * 60 * 60 * 1000;
  };
  return (
    <div className="planet-station-groups">{groups.map(({ station, planets: groupPlanets }) => <section className="planet-station-group" key={station?.id ?? "unassociated"}>
              <div className="planet-station-heading">
                <div>
                  <h2>{station?.name || groupPlanets.find((planet) => planet.planetPortal === station?.portal)?.almanacName || t(station ? "stations.space_station" : "planet.no_associated_station")}{groupPlanets.some((planet) => planet.blackMarket) && <span aria-label={t("planet.black_market")} className="planet-station-black-market" data-tooltip={t("planet.black_market")} role="img" tabIndex={0}><Skull aria-hidden="true" size={15} /></span>}{isNewStation(station) && <span className="planet-station-new">{t("stations.new_badge")}</span>}</h2>
                  {station && <p className="planet-station-address"><span className={station.galaxy !== 0 ? "mission-galaxy-alert" : undefined} data-tooltip={station.galaxy !== 0 ? t("missions.galaxy_portals_warning") : undefined} tabIndex={station.galaxy !== 0 ? 0 : undefined}>{station.galaxy !== 0 && <AlertTriangle size={9} />}{galaxyLabel(station.galaxy)}</span> · {station.portal}</p>}
                  {groupPlanets[0]?.systemFacts.length > 0 && <div className="planet-station-facts">
                    {groupPlanets[0].systemFacts.map((fact) => <span key={fact.label}><b>{t(fact.label)}</b>{fact.label === "common.race" && raceIcons[fact.value] && <span aria-label={tv(fact.value)} className="planet-race-icon" data-tooltip={tv(fact.value)} role="img" style={{ "--race-icon": `url(${raceIcons[fact.value]})` } as CSSProperties} />}{fact.label === "common.race" && !raceIcons[fact.value] && <span aria-label={tv(fact.value)} className="planet-race-unknown" data-tooltip={tv(fact.value)} role="img">-</span>}{fact.label !== "common.conflict" && fact.label !== "common.race" && <> {tv(fact.value)}</>}{fact.label === "common.economy" && groupPlanets[0].economyStars !== undefined && <span aria-label={`${groupPlanets[0].economyStars}/3`} className="planet-economy-stars">{" "}{"★".repeat(groupPlanets[0].economyStars)}{"☆".repeat(3 - groupPlanets[0].economyStars)}</span>}{fact.label === "common.conflict" && conflictLevels[fact.value] !== undefined && <span aria-label={tv(fact.value)} className="planet-conflict-dots" data-tooltip={tv(fact.value)} role="img">{[1, 2, 3].map((step) => <i className={step <= conflictLevels[fact.value] ? "filled" : undefined} key={step} />)}</span>}</span>)}
                  </div>}
                </div>
                {station && <Link
                  aria-label={t("planet.open_station_in_stations", { station: station.name || station.portal })}
                  className="member-icon-action planet-station-link"
                  data-tooltip={t("planet.open_station_in_stations", { station: station.name || station.portal })}
                  href={`/stations?search=${encodeURIComponent(station.portal)}`}
                ><Orbit aria-hidden="true" size={15} /></Link>}
              </div>
              <ul className="planet-mission-list">{groupPlanets.map((planet) => <PlanetDestinationCard key={planet.id} onOpen={onOpen} planet={planet} />)}</ul>
            </section>)}</div>
  );
}
