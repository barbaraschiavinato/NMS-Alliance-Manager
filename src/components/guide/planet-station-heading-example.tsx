import { PlanetStationHeading } from "@/components/sections/planet-list";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";

export function PlanetStationHeadingExample({ planet }: Readonly<{ planet: PlanetDestination }>) {
  return (
    <div className="planet-station-group">
      <PlanetStationHeading planets={[planet]} renderedAt={0} showMapLink={false} station={planet.station} />
    </div>
  );
}
