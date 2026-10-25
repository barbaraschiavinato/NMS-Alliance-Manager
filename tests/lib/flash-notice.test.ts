// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setFlashNotice, useFlashNotice } from "@/lib/navigation/flash-notice";

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("flash notice", () => {
  it("shows the message until it is dismissed", () => {
    const { result } = renderHook(() => useFlashNotice());
    expect(result.current[0]).toBe("");
    act(() => setFlashNotice("missions.mission_created"));
    expect(result.current[0]).toBe("missions.mission_created");
    act(() => result.current[1]());
    expect(result.current[0]).toBe("");
  });

  it("keeps a message that contains the separator", () => {
    const { result } = renderHook(() => useFlashNotice());
    act(() => setFlashNotice("a|b"));
    expect(result.current[0]).toBe("a|b");
  });

  it("forgets a message once it is too old", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
    setFlashNotice("old");
    vi.setSystemTime(new Date("2026-10-25T08:01:00Z"));
    const { result } = renderHook(() => useFlashNotice());
    expect(result.current[0]).toBe("");
  });

  it("ignores unavailable session storage", () => {
    const { result } = renderHook(() => useFlashNotice());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    act(() => setFlashNotice("anything"));
    expect(result.current[0]).toBe("");
    act(() => result.current[1]());
    expect(result.current[0]).toBe("");
  });
});
