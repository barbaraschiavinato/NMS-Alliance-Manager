import { describe, expect, it } from "vitest";
import { getViewSwitchDestination } from "@/lib/navigation/view-navigation";

describe("getViewSwitchDestination", () => {
  it.each(["/users", "/users/member-id", "/offline-players", "/offline-players/member-id"])(
    "redirects %s to the first simple-view page",
    (pathname) => {
      expect(getViewSwitchDestination(pathname, true)).toBe("/stations");
    },
  );

  it.each(["/stations", "/missions", "/planets", "/messages"])(
    "keeps %s when it is available in simple view",
    (pathname) => {
      expect(getViewSwitchDestination(pathname, true)).toBeNull();
    },
  );

  it("keeps the current page when switching back to extended view", () => {
    expect(getViewSwitchDestination("/users", false)).toBeNull();
  });
});
