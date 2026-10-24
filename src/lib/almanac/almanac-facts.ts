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

// Wealth description of the system economy (for example "Destitute" or "Affluent"), the first economy mark.
export function almanacWealth(economy: unknown): string | undefined {
  const marks = asRecord(economy)?.marks;
  if (!Array.isArray(marks)) return undefined;
  for (const mark of marks) {
    const word = almanacWord(mark);
    if (word) return word;
  }
  return undefined;
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
