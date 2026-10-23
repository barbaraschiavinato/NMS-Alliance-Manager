export function sortByCreatedAtDescending<T extends { createdAt?: string }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => {
      const timestamp = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
      return { item, index, timestamp };
    })
    .sort((first, second) => {
      const firstHasDate = Number.isFinite(first.timestamp);
      const secondHasDate = Number.isFinite(second.timestamp);
      if (firstHasDate !== secondHasDate) return firstHasDate ? -1 : 1;
      if (!firstHasDate) return first.index - second.index;
      return second.timestamp - first.timestamp || first.index - second.index;
    })
    .map(({ item }) => item);
}
