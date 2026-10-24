export type AlmanacFact = { label: string; value: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function almanacWord(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.word === "string" ? record.word : undefined;
}

export function almanacStarCount(value: unknown): number | undefined {
  const record = asRecord(value);
  if (typeof record?.stars !== "number" || !Number.isFinite(record.stars)) return undefined;
  return Math.max(0, Math.min(3, Math.floor(record.stars)));
}

// System-level facts of an Almanac planet band, shown in the Planets system heading and on station cards.
export function almanacSystemFacts(band: Record<string, unknown> | null | undefined): AlmanacFact[] {
  return (
    [
      ["planet.star", almanacWord(band?.star)],
      ["common.economy", almanacWord(band?.economy)],
      ["common.conflict", almanacWord(band?.conflict)],
      ["common.race", almanacWord(band?.race)],
    ] as const
  ).flatMap(([label, value]) => (value ? [{ label, value }] : []));
}
