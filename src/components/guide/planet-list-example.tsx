import { getSystemPlanetAddresses } from "@/lib/planet-addresses";
import { PlanetListExampleView } from "./planet-list-example-view";
import { guideStationInit } from "./station-init";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { almanacDiscoveryCounts } from "@/lib/almanac-discovery-counts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function word(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.word === "string" ? record.word : undefined;
}

function facts(entries: readonly (readonly [string, string | undefined])[]) {
  return entries.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

function resourceNames(carries: unknown, kinds: readonly string[]) {
  if (!Array.isArray(carries)) return [];
  return [
    ...new Set(
      carries.flatMap((entry) => {
        const record = asRecord(entry);
        return typeof record?.name === "string" && typeof record.kind === "string" && kinds.includes(record.kind)
          ? [record.name]
          : [];
      }),
    ),
  ];
}

export async function createPlanetListExamplePlanet(): Promise<PlanetDestination> {
  const planetAddress = (await getSystemPlanetAddresses(guideStationInit.portal, guideStationInit.galaxy)).find(
    ({ portal }) => portal === guideStationInit.portal,
  );
  if (!planetAddress) throw new Error("Guide sample planet address was not found in its system.");

  const response = guideStationInit.response;
  const lines = asRecord(response.lines);
  const band = asRecord(lines?.band);
  const headline = asRecord(lines?.headline);
  const pictures = asRecord(response.pictures);
  const economy = asRecord(band?.economy);
  const sentinels = asRecord(band?.sentinels);
  const name = typeof headline?.word === "string" ? headline.word : guideStationInit.portal;
  const discImage =
    typeof pictures?.disc === "string" && pictures.disc.startsWith("/planets/")
      ? `https://nmsalmanac.com/api${pictures.disc}`
      : undefined;
  const almanacFacts = facts([
    ["common.planet_type_label", word(band?.type)],
    ["planet.size", word(band?.size)],
    ["planet.weather", word(band?.weather)],
    ["planet.water", word(band?.water)],
    ["planet.sentinels", word(band?.sentinels)],
  ]);
  const systemFacts = facts([
    ["planet.star", word(band?.star)],
    ["common.economy", word(band?.economy)],
    ["common.conflict", word(band?.conflict)],
    ["common.race", word(band?.race)],
  ]);

  return {
    id: `${planetAddress.portal}:${guideStationInit.galaxy}`,
    portal: guideStationInit.portal,
    planetPortal: planetAddress.portal,
    planetNumber: planetAddress.number,
    galaxy: guideStationInit.galaxy,
    almanacName: name,
    ...(discImage ? { imageUrl: discImage } : {}),
    almanacSearchIndex: `${name} ${guideStationInit.portal}`,
    almanacFacts,
    systemFacts,
    discoveryCounts: almanacDiscoveryCounts(band),
    ...(word(band?.type) ? { planetType: word(band?.type) } : {}),
    ...(typeof economy?.stars === "number" ? { economyStars: economy.stars } : {}),
    plants: resourceNames(response.carries, ["plant", "consumable"]),
    minerals: resourceNames(response.carries, ["mineral"]),
    valuables: resourceNames(response.carries, ["tradeable"]),
    dissonant: sentinels?.ink === "exotic",
    paradise: response.paradise,
    blackMarket: economy?.black_market === true,
    station: {
      id: `${guideStationInit.portal}:${guideStationInit.galaxy}`,
      portal: guideStationInit.portal,
      galaxy: guideStationInit.galaxy,
      name: typeof response.name === "string" ? response.name : name,
    },
  };
}

export function PlanetListExample({ planet }: Readonly<{ planet: PlanetDestination }>) {
  return <PlanetListExampleView planet={planet} planetData={guideStationInit.response} />;
}
