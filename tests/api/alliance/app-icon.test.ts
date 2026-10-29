import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAlliance, seedMembers } from "../../helpers/members";
import { blobResult, notModifiedResult, resetData } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));

const iconPath = "alliance-manager/branding/11111111-2222-4333-8444-555555555555.png";
const iconUrl = `/api/alliance/image?path=${encodeURIComponent(iconPath)}`;
let configuredAlliance = defaultAlliance;

beforeEach(() => {
  resetData();
  vi.mocked(get).mockReset();
  configuredAlliance = defaultAlliance;
});

async function route() {
  return import("@/app/api/alliance/app-icon/route");
}

async function fetchIcon(size: string) {
  return (await route()).GET(new Request(`http://localhost/api/alliance/app-icon?size=${size}`));
}

function configureBlob(alliance: typeof defaultAlliance, iconResult: Awaited<ReturnType<typeof get>> = null) {
  configuredAlliance = alliance;
  seedMembers([], alliance);
  vi.stubEnv("NMS_READ_WRITE_TOKEN", "test-blob-token");
  vi.mocked(get).mockImplementation(async (pathname) => {
    if (pathname === "alliance-manager/access.json") {
      return blobResult(JSON.stringify({ members: [], alliance: configuredAlliance }), "application/json");
    }
    return iconResult;
  });
}

describe("GET /api/alliance/app-icon", () => {
  it("returns 404 for unsupported icon sizes without requiring a session", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=64"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Icona non trovata." });
  });

  it("does not accept inherited property names as icon sizes", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=toString"));
    expect(response.status).toBe(404);
  });

  it("returns 404 when an icon is not configured", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=192"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Icona non configurata." });
  });

  it.each([
    ["32", "faviconUrl"],
    ["180", "appleIconUrl"],
    ["192", "appIcon192Url"],
    ["512", "appIcon512Url"],
  ] as const)("streams the configured %s-pixel PNG", async (size, field) => {
    configureBlob({ ...defaultAlliance, [field]: iconUrl }, blobResult("PNGDATA", "image/png"));

    const response = await fetchIcon(size);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("PNGDATA");
    expect(get).toHaveBeenCalledWith(
      iconPath,
      expect.objectContaining({ access: "private", useCache: false, token: "test-blob-token" }),
    );
  });

  it.each([
    ["an external URL", "https://example.com/icon.png"],
    ["a malformed URL", "http://%"],
    ["an image URL without a path", "/api/alliance/image"],
    ["a path outside the branding PNG folder", "/api/alliance/image?path=alliance-manager%2Faccess.json"],
  ])("rejects %s", async (_label, configuredUrl) => {
    seedMembers([], { ...defaultAlliance, appIcon192Url: configuredUrl });
    const response = await fetchIcon("192");
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 when the Blob store is not configured", async () => {
    seedMembers([], { ...defaultAlliance, appIcon192Url: iconUrl });
    expect((await fetchIcon("192")).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 for missing, not-modified or non-PNG blobs", async () => {
    configureBlob({ ...defaultAlliance, appIcon192Url: iconUrl });
    expect((await fetchIcon("192")).status).toBe(404);
    vi.mocked(get).mockImplementation(async (pathname) =>
      pathname === "alliance-manager/access.json"
        ? blobResult(JSON.stringify({ members: [], alliance: configuredAlliance }), "application/json")
        : notModifiedResult(),
    );
    expect((await fetchIcon("192")).status).toBe(404);
    vi.mocked(get).mockImplementation(async (pathname) =>
      pathname === "alliance-manager/access.json"
        ? blobResult(JSON.stringify({ members: [], alliance: configuredAlliance }), "application/json")
        : blobResult("JPEGDATA", "image/jpeg"),
    );
    expect((await fetchIcon("192")).status).toBe(404);
  });

  it("returns 503 when the Blob store throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    configureBlob({ ...defaultAlliance, appIcon192Url: iconUrl });
    vi.mocked(get).mockImplementation(async (pathname) => {
      if (pathname === "alliance-manager/access.json") {
        return blobResult(JSON.stringify({ members: [], alliance: configuredAlliance }), "application/json");
      }
      throw new Error("blob unavailable");
    });

    const response = await fetchIcon("192");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Impossibile leggere l'icona." });
    expect(console.error).toHaveBeenCalledWith("Unable to read public alliance app icon", expect.any(Error));
  });
});
