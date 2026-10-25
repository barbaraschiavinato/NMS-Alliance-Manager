"use client";

import { DetailLink as Link } from "@/components/shared/detail-page";
import { AlertTriangle, Orbit, Skull } from "lucide-react";
import { galaxyLabel } from "@/lib/planets/galaxies";
import {
  PlanetDestinationCard,
  type PlanetDestination,
  type PlanetVisitControls,
} from "@/components/cards/planet-destination-card";
import { useLocale } from "@/components/providers/locale-provider";
import { SystemFacts } from "@/components/shared/system-facts";
import { SystemFeatureBadge } from "@/components/shared/system-feature-badge";
import { stationDetailHref } from "@/lib/navigation/detail-links";

export function PlanetStationHeading({
  station,
  planets,
  renderedAt,
  showStationLink = true,
}: Readonly<{
  station: PlanetDestination["station"];
  planets: readonly PlanetDestination[];
  renderedAt: number;
  showStationLink?: boolean;
}>) {
  const { t } = useLocale();
  const createdTime = station?.createdAt ? Date.parse(station.createdAt) : Number.NaN;
  const isNewStation =
    Boolean(station) &&
    !station?.hasMissions &&
    Number.isFinite(createdTime) &&
    renderedAt - createdTime < 7 * 24 * 60 * 60 * 1000;
  return (
    <div className="planet-station-heading">
      <div>
        <h2>
          {station?.name ||
            planets.find((planet) => planet.planetPortal === station?.portal)?.almanacName ||
            t(station ? "stations.space_station" : "planet.no_associated_station")}
          {planets.some((planet) => planet.blackMarket) && (
            <span
              aria-label={t("planet.black_market")}
              className="planet-station-black-market"
              data-tooltip={t("planet.black_market")}
              role="img"
              tabIndex={0}
            >
              <Skull aria-hidden="true" size={15} />
            </span>
          )}
          {(station ?? planets[0]) && (
            <SystemFeatureBadge galaxy={(station ?? planets[0]).galaxy} portal={(station ?? planets[0]).portal} />
          )}
          {isNewStation && <span className="planet-station-new">{t("stations.new_badge")}</span>}
        </h2>
        {station && (
          <p className="planet-station-address">
            <span
              className={station.galaxy !== 0 ? "mission-galaxy-alert" : undefined}
              data-tooltip={station.galaxy !== 0 ? t("missions.galaxy_portals_warning") : undefined}
              tabIndex={station.galaxy !== 0 ? 0 : undefined}
            >
              {station.galaxy !== 0 && <AlertTriangle size={9} />}
              {galaxyLabel(station.galaxy)}
            </span>{" "}
            · {station.portal}
          </p>
        )}
        {planets[0] && <SystemFacts economyStars={planets[0].economyStars} facts={planets[0].systemFacts} />}
      </div>
      {station && showStationLink && (
        <Link
          aria-label={t("planet.open_station_in_stations", { station: station.name || station.portal })}
          className={`member-icon-action member-station-filter planet-station-link${
            station.canCreateMission ? " station-create-mission-pulse" : ""
          }`}
          data-tooltip={t("planet.open_station_in_stations", { station: station.name || station.portal })}
          href={stationDetailHref(station.id, "planets")}
        >
          <Orbit aria-hidden="true" size={15} />
        </Link>
      )}
    </div>
  );
}

export function PlanetList({
  groups,
  renderedAt,
  onOpen,
  showStationLink = true,
  visits,
}: Readonly<{
  renderedAt: number;
  groups: { station: PlanetDestination["station"]; planets: PlanetDestination[] }[];
  onOpen: (planet: PlanetDestination) => void;
  showStationLink?: boolean;
  visits?: PlanetVisitControls;
}>) {
  return (
    <div className="planet-station-groups">
      {groups.map(({ station, planets: groupPlanets }) => (
        <section
          className="planet-station-group"
          key={`${groupPlanets[0].galaxy}:${groupPlanets[0].planetPortal.slice(1).toUpperCase()}`}
        >
          <PlanetStationHeading
            planets={groupPlanets}
            renderedAt={renderedAt}
            station={station}
            showStationLink={showStationLink}
          />
          <div className="planet-mission-list">
            {groupPlanets.map((planet) => (
              <PlanetDestinationCard key={planet.id} onOpen={onOpen} planet={planet} visits={visits} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
