export type SystemFeature = "black-hole" | "atlas" | "gas-giant";

const portalPattern = /^[0-9A-F]{12}$/i;

// Each region reserves the system right after its guide stars for a black hole and then for an Atlas Interface.
// This mirrors the rule used by nms-core's systemAttributes(); the NMS Almanac reports the same systems
// as `features: ["black-hole"]` and `features: ["atlas"]`.
async function specialSystem(address: bigint): Promise<"black-hole" | "atlas" | null> {
  const { voxelAttributes } = await import("@/lib/nms-core/region.js");
  const attributes = voxelAttributes(address);
  const offset = Number((address >> BigInt(32)) & BigInt(0xfff)) - 1 - attributes.guide_star_count;
  if (offset < 0) return null;
  if (offset < attributes.black_hole_count) return "black-hole";
  if (offset - attributes.black_hole_count < attributes.atlas_station_count) return "atlas";
  return null;
}

// Purple-star systems can collapse into a single gas giant with five moons (the generator seed includes the galaxy).
export async function systemFeature(portal: string, galaxy: number): Promise<SystemFeature | null> {
  if (!portalPattern.test(portal)) return null;
  const address = BigInt(`0x${portal}`);
  const special = await specialSystem(address);
  // System index 0 is not a real system and nms-core cannot generate it.
  const hasSystemIndex = (address >> BigInt(32)) & BigInt(0xfff);
  if (special || !hasSystemIndex || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) return special;
  const { systemAttributes } = await import("@/lib/nms-core/system.js");
  return systemAttributes(address, galaxy).gas_giant ? "gas-giant" : null;
}
