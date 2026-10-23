function pageSize(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const size = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(size)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return size;
}

export const listPageSize = pageSize(process.env.NEXT_PUBLIC_LIST_PAGE_SIZE, 50, "NEXT_PUBLIC_LIST_PAGE_SIZE");
export const planetSystemsPageSize = pageSize(
  process.env.NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE,
  20,
  "NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE",
);
