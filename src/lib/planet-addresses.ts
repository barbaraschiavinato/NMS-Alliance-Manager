export type SystemPlanetAddress = Readonly<{ portal: string; number: number }>;

export async function getSystemPlanetAddresses(systemAddress: string, galaxy: number): Promise<SystemPlanetAddress[]> {
  const portal = systemAddress.toUpperCase();
  const { planetSeeds } = await import("@/lib/nms-core/system.js");
  const bodyCount = planetSeeds(BigInt(`0x${portal}`), galaxy).planet_seeds.length;
  if (bodyCount < 1 || bodyCount > 6) {
    throw new Error("Invalid system planet count.");
  }

  const planetIndexes = new Set(
    Array.from({ length: bodyCount }, (_, index) => (index + 1).toString(16).toUpperCase()),
  );
  if (portal[0] !== "0") planetIndexes.add(portal[0]);

  return [...planetIndexes].map((index, position) => ({
    portal: `${index}${portal.slice(1)}`,
    number: position + 1,
  }));
}
