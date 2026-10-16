export type AlmanacDiscoveryCounts = Partial<Record<"flora" | "fauna" | "minerals", number>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function almanacDiscoveryCounts(band: unknown): AlmanacDiscoveryCounts {
  const counts: AlmanacDiscoveryCounts = {};
  if (!isRecord(band)) return counts;

  for (const [key, field] of [
    ["flora", "note"],
    ["fauna", "note"],
    ["minerals", "word"],
  ] as const) {
    const fact = band[key];
    if (!isRecord(fact)) continue;
    const value: unknown = fact[field];
    const match =
      typeof value === "string" ? value.trim().match(/^(\d+)(?:\s+(?:plants?|species|minerals?))?$/i) : null;
    const count = typeof value === "number" ? value : match ? Number(match[1]) : undefined;
    if (count !== undefined && Number.isSafeInteger(count) && count >= 0) counts[key] = count;
  }
  return counts;
}
