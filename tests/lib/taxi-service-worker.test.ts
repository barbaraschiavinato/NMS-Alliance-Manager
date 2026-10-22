import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";

const source = readFileSync(fileURLToPath(new URL("../../public/taxi-push-sw.js", import.meta.url)), "utf8");
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(undefined) };
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://alliance.example" },
      registration: { showNotification },
      clients,
      addEventListener: (type: string, callback: (event: unknown) => void) => handlers.set(type, callback),
    },
  });
  async function dispatch(type: string, event: Record<string, unknown>) {
    const promises: Promise<unknown>[] = [];
    const handler = handlers.get(type);
    if (!handler) throw new Error("Missing handler");
    handler({ ...event, waitUntil: (promise: Promise<unknown>) => promises.push(promise) });
    await Promise.all(promises);
  }
  return { showNotification, clients, dispatch };
}
describe("Taxi service worker", () => {
  it("provides an installable manifest with raster and vector icons", () => {
    expect(manifest()).toMatchObject({ display: "standalone", start_url: "/taxi" });
    expect(manifest().icons).toHaveLength(2);
  });
  it("shows push summaries and accepts only internal taxi navigation", async () => {
    const sw = worker();
    await sw.dispatch("push", {});
    expect(sw.showNotification).not.toHaveBeenCalled();
    await sw.dispatch("push", { data: { json: () => ({ title: "Taxi", body: "Ride", path: "/taxi/id", tag: "id" }) } });
    expect(sw.showNotification).toHaveBeenCalledWith(
      "Taxi",
      expect.objectContaining({ body: "Ride", data: { path: "/taxi/id" } }),
    );
    await sw.dispatch("push", { data: { json: () => ({ path: "https://evil.example" }) } });
    expect(sw.showNotification).toHaveBeenLastCalledWith(
      "Taxi",
      expect.objectContaining({ data: { path: "/taxi" } }),
    );
  });
  it("opens a safe detail page when no app window is available", async () => {
    const sw = worker();
    const close = vi.fn();
    await sw.dispatch("notificationclick", { notification: { close, data: { path: "/taxi/id" } } });
    expect(close).toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalledWith("https://alliance.example/taxi/id");
  });
  it("focuses and navigates an existing same-origin window", async () => {
    const sw = worker();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    sw.clients.matchAll.mockResolvedValue([
      { url: "https://elsewhere.example" },
      { url: "https://alliance.example/taxi", navigate, focus },
    ]);
    await sw.dispatch("notificationclick", { notification: { close: vi.fn(), data: { path: "//evil.example" } } });
    expect(navigate).toHaveBeenCalledWith("https://alliance.example/taxi");
    expect(focus).toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });
});
