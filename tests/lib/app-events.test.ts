// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { appEvents, broadcastRequestsEvent, dispatchAppEvent, onAppEvent } from "@/lib/navigation/app-events";

describe("app events", () => {
  it("dispatches a plain window event with the given name", () => {
    const listener = vi.fn();
    window.addEventListener("farms-changed", listener);
    dispatchAppEvent("farms-changed");
    window.removeEventListener("farms-changed", listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  it("listens to one or several events until the returned function is called", () => {
    const single = vi.fn();
    const several = vi.fn();
    const stopSingle = onAppEvent("pets-changed", single);
    const stopSeveral = onAppEvent(["help-requests-changed", "taxi-requests-changed"], several);

    dispatchAppEvent("pets-changed");
    dispatchAppEvent("help-requests-changed");
    dispatchAppEvent("taxi-requests-changed");
    dispatchAppEvent("farms-changed");
    expect(single).toHaveBeenCalledTimes(1);
    expect(several).toHaveBeenCalledTimes(2);

    stopSingle();
    stopSeveral();
    dispatchAppEvent("pets-changed");
    dispatchAppEvent("help-requests-changed");
    expect(single).toHaveBeenCalledTimes(1);
    expect(several).toHaveBeenCalledTimes(2);
  });

  it("maps each broadcast board to its own change event", () => {
    expect(broadcastRequestsEvent("help")).toBe("help-requests-changed");
    expect(broadcastRequestsEvent("taxi")).toBe("taxi-requests-changed");
  });

  it("lists every event name once", () => {
    expect(new Set(appEvents).size).toBe(appEvents.length);
  });
});
