import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

describe("pagination configuration", () => {
  it("defaults to 50 list items and 20 systems", async () => {
    const sizes = await import("@/lib/pagination");
    expect(sizes.listPageSize).toBe(50);
    expect(sizes.planetSystemsPageSize).toBe(20);
  });

  it("allows local-sized overrides of 10 items and 5 systems", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIST_PAGE_SIZE", "10");
    vi.stubEnv("NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE", "5");
    const sizes = await import("@/lib/pagination");
    expect(sizes.listPageSize).toBe(10);
    expect(sizes.planetSystemsPageSize).toBe(5);
  });

  it("uses defaults for empty values", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIST_PAGE_SIZE", "");
    vi.stubEnv("NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE", "");
    const sizes = await import("@/lib/pagination");
    expect(sizes.listPageSize).toBe(50);
    expect(sizes.planetSystemsPageSize).toBe(20);
  });

  it.each(["0", "-1", "1.5", "abc", " 10", "1e2", "9007199254740992"])(
    "rejects invalid page size %s",
    async (value) => {
      vi.stubEnv("NEXT_PUBLIC_LIST_PAGE_SIZE", value);
      await expect(import("@/lib/pagination")).rejects.toThrow("NEXT_PUBLIC_LIST_PAGE_SIZE must be a positive integer");
    },
  );

  it("validates the system page size independently", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE", "0");
    await expect(import("@/lib/pagination")).rejects.toThrow(
      "NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE must be a positive integer",
    );
  });
});
