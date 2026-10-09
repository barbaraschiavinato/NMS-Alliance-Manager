const shardCache = new Map<number, unknown>();

class MissingShardError extends Error {
  constructor(readonly shard: number) {
    super(`Missing letter map shard ${shard}`);
  }
}

// Only the shard needed by the system is downloaded: the name generator signals which one it reads.
const letterMap = new Proxy({}, {
  get(_target, key) {
    if (typeof key !== "string" || !/^[0-7]$/.test(key)) return undefined;
    const shard = Number(key);
    if (!shardCache.has(shard)) throw new MissingShardError(shard);
    return shardCache.get(shard);
  },
});

export async function generateSystemName(portal: string, galaxy: number): Promise<string | null> {
  if (!/^[0-9A-F]{12}$/i.test(portal) || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) return null;
  try {
    const { systemName } = await import("@/lib/nms-core/system.js");
    const address = BigInt(`0x${portal}`);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const name = systemName(address, galaxy, letterMap);
        return typeof name === "string" && name.trim() ? name.trim() : null;
      } catch (error) {
        if (!(error instanceof MissingShardError)) throw error;
        const response = await fetch(`/nms-core/letter_map_${error.shard}.json`);
        if (!response.ok) throw new Error(`Unable to load letter map shard ${error.shard}`);
        shardCache.set(error.shard, await response.json());
      }
    }
  } catch (error) {
    console.error("Unable to generate system name with nms-core", error);
  }
  return null;
}
