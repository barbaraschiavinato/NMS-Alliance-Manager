import { describe, expect, it } from "vitest";
import { imageUploadMaxBytes, isNewItem, newItemWindowMs } from "@/lib/utils/limits";

describe("isNewItem", () => {
  const now = Date.parse("2026-11-10T12:00:00.000Z");

  it("treats items created within the last seven days as new", () => {
    expect(isNewItem("2026-11-10T11:00:00.000Z", now)).toBe(true);
    expect(isNewItem(new Date(now - newItemWindowMs + 1).toISOString(), now)).toBe(true);
  });

  it("stops treating items as new once the seven-day window has passed", () => {
    expect(isNewItem(new Date(now - newItemWindowMs).toISOString(), now)).toBe(false);
    expect(isNewItem("2026-10-01T00:00:00.000Z", now)).toBe(false);
  });

  it("ignores missing or invalid dates", () => {
    expect(isNewItem(undefined, now)).toBe(false);
    expect(isNewItem(null, now)).toBe(false);
    expect(isNewItem("", now)).toBe(false);
    expect(isNewItem("not a date", now)).toBe(false);
  });

  it("keeps the shared limits at their documented values", () => {
    expect(newItemWindowMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(imageUploadMaxBytes).toBe(5 * 1024 * 1024);
  });
});
