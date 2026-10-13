import { describe, expect, it } from "vitest";
import { sortByCreatedAtDescending } from "@/lib/created-at";

describe("sortByCreatedAtDescending", () => {
  it("puts newest first and undated items last in original order", () => {
    const items = [
      { id: "none-1" },
      { id: "old", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "bad", createdAt: "not a date" },
      { id: "new", createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "none-2", createdAt: "" },
      { id: "mid", createdAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(sortByCreatedAtDescending(items).map((item) => item.id)).toEqual([
      "new",
      "mid",
      "old",
      "none-1",
      "bad",
      "none-2",
    ]);
  });

  it("keeps original order for equal timestamps", () => {
    const items = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(sortByCreatedAtDescending(items).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const items = [{ createdAt: "2026-01-01" }, { createdAt: "2026-02-01" }];
    const copy = [...items];
    sortByCreatedAtDescending(items);
    expect(items).toEqual(copy);
    expect(sortByCreatedAtDescending([])).toEqual([]);
  });
});
