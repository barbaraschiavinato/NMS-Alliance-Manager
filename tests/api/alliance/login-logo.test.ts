import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAlliance, seedMembers } from "../../helpers/members";
import {
  accessBlob,
  blobFiles,
  castMembers,
  makeCast,
  notModifiedResult,
  resetData,
  type Cast,
} from "../helpers/fixtures";

vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));

const logoPath = "alliance-manager/branding/1234abcd-0000-4000-8000-000000000000.webp";
const logoUrl = `/api/alliance/image?path=${encodeURIComponent(logoPath)}`;
let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
});

async function fetchLogo() {
  const { GET } = await import("@/app/api/alliance/login-logo/route");
  return GET();
}

function useBlobStore(
  logo: string,
  image: { body: string; contentType: string } = { body: "WEBP", contentType: "image/webp" },
) {
  vi.stubEnv("NMS_READ_WRITE_TOKEN", "blob-token");
  vi.mocked(get).mockImplementation(blobFiles({ ...accessBlob(cast, { logoUrl: logo }), [logoPath]: image }));
}

describe("GET /api/alliance/login-logo", () => {
  it("returns 404 when no logo is configured", async () => {
    seedMembers(castMembers(cast));
    const response = await fetchLogo();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Logo non configurato." });
  });

  it.each([
    ["an external URL", "https://cdn.example/logo.png"],
    ["another image path", "/api/other?path=alliance-manager/branding/logo.png"],
    ["a non-branding blob", "/api/alliance/image?path=alliance-manager/access.json"],
    ["a traversal path", `/api/alliance/image?path=${encodeURIComponent("alliance-manager/branding/../access.json")}`],
    ["an unsupported extension", "/api/alliance/image?path=alliance-manager/branding/abc.svg"],
    ["a missing path", "/api/alliance/image"],
  ])("returns 404 for %s without touching Blob", async (_label, url) => {
    seedMembers(castMembers(cast), { ...defaultAlliance, logoUrl: url });
    expect((await fetchLogo()).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 for an unparsable logo URL", async () => {
    seedMembers(castMembers(cast), { ...defaultAlliance, logoUrl: "http://[broken" });
    const response = await fetchLogo();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Logo non valido." });
  });

  it("returns 404 when no Blob store is configured", async () => {
    seedMembers(castMembers(cast), { ...defaultAlliance, logoUrl });
    expect((await fetchLogo()).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves the logo publicly, without a session", async () => {
    useBlobStore(logoUrl);
    const response = await fetchLogo();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("WEBP");
    expect(get).toHaveBeenCalledWith(logoPath, expect.objectContaining({ access: "private", token: "blob-token" }));
  });

  it("returns 404 for missing, not-modified or non-image blobs", async () => {
    useBlobStore(logoUrl, { body: "<svg/>", contentType: "image/svg+xml" });
    expect((await fetchLogo()).status).toBe(404);

    const access = accessBlob(cast, { logoUrl });
    vi.mocked(get).mockImplementation(blobFiles(access));
    expect((await fetchLogo()).status).toBe(404);

    vi.mocked(get).mockImplementation(async (pathname) =>
      pathname === logoPath ? notModifiedResult() : blobFiles(access)(pathname),
    );
    expect((await fetchLogo()).status).toBe(404);
  });

  it("returns 503 when Blob fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useBlobStore(logoUrl);
    const access = accessBlob(cast, { logoUrl });
    vi.mocked(get).mockImplementation(async (pathname) => {
      if (pathname === logoPath) throw new Error("blob down");
      return blobFiles(access)(pathname);
    });
    const response = await fetchLogo();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Impossibile leggere il logo." });
  });
});
