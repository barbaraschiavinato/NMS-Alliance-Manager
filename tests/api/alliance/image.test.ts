import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { seedMembers } from "../../helpers/members";
import {
  accessBlob,
  blobFiles,
  blobResult,
  castMembers,
  makeCast,
  notModifiedResult,
  resetData,
  type Cast,
} from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));

const imagePath = "alliance-manager/branding/1234abcd-0000-4000-8000-000000000000.png";
let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  vi.mocked(get).mockImplementation(
    blobFiles({
      ...accessBlob(cast),
      [imagePath]: { body: "PNGDATA", contentType: "image/png" },
    }),
  );
});

async function fetchImage(path?: string) {
  const { GET } = await import("@/app/api/alliance/image/route");
  const query = path === undefined ? "" : `?path=${encodeURIComponent(path)}`;
  return GET(new Request(`http://localhost:3000/api/alliance/image${query}`));
}

describe("GET /api/alliance/image", () => {
  it("returns 401 without a session or for pending/blocked members", async () => {
    signInAs(null);
    expect((await fetchImage(imagePath)).status).toBe(401);
    for (const member of [cast.pending, cast.blocked]) {
      signInAs(member);
      expect((await fetchImage(imagePath)).status).toBe(401);
    }
  });

  it("returns 404 for paths outside the branding folder", async () => {
    signInAs(cast.user);
    for (const path of [undefined, "", "alliance-manager/access.json", "other/branding/x.png"]) {
      expect((await fetchImage(path)).status).toBe(404);
    }
    expect(get).not.toHaveBeenCalledWith("alliance-manager/access.json", expect.anything());
  });

  it("returns 404 when no Blob store is configured", async () => {
    signInAs(cast.user);
    expect((await fetchImage(imagePath)).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves an image saved in the local data folder when no Blob store is configured", async () => {
    mkdirSync(path.join(process.cwd(), "data", "uploads", path.dirname(imagePath)), { recursive: true });
    writeFileSync(path.join(process.cwd(), "data", "uploads", imagePath), "LOCALPNG");
    signInAs(cast.user);
    const response = await fetchImage(imagePath);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("LOCALPNG");
    expect(get).not.toHaveBeenCalled();
  });

  it("does not serve local files outside the uploads folder", async () => {
    signInAs(cast.user);
    expect((await fetchImage("alliance-manager/branding/../../../access.json")).status).toBe(404);
  });

  describe("with a Blob store", () => {
    beforeEach(() => {
      vi.stubEnv("NMS_READ_WRITE_TOKEN", "blob-token");
    });

    it("streams the image to any approved member, including simple-view admins", async () => {
      for (const member of [cast.user, cast.simpleAdmin, cast.moderator, cast.admin]) {
        signInAs(member);
        const response = await fetchImage(imagePath);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(await response.text()).toBe("PNGDATA");
      }
      expect(get).toHaveBeenCalledWith(
        imagePath,
        expect.objectContaining({ access: "private", useCache: false, token: "blob-token" }),
      );
    });

    it("rejects path traversal and non-image names without calling Blob", async () => {
      signInAs(cast.user);
      const paths = [
        "alliance-manager/branding/../access.json",
        "alliance-manager/branding/../private-messages.json",
        "alliance-manager/branding/..%2Faccess.json",
        "alliance-manager/branding/%2e%2e/access.json",
        "alliance-manager/branding/..\\access.json",
        "alliance-manager/branding/./1234abcd-0000-4000-8000-000000000000.png",
        "alliance-manager/branding/sub/image.png",
        "alliance-manager/branding/notes.json",
        "alliance-manager/branding/",
        "/alliance-manager/branding/1234abcd-0000-4000-8000-000000000000.png",
      ];
      for (const path of paths) {
        expect((await fetchImage(path)).status, path).toBe(404);
      }
      // The query string is decoded once: a doubly encoded traversal must be rejected as well.
      const { GET } = await import("@/app/api/alliance/image/route");
      const encoded = await GET(
        new Request(
          "http://localhost:3000/api/alliance/image?path=alliance-manager%2Fbranding%2F%252e%252e%252Faccess.json",
        ),
      );
      expect(encoded.status).toBe(404);
      // Blob is only read for the session's member document, never for the requested paths.
      const requested = new Set(vi.mocked(get).mock.calls.map(([pathname]) => pathname));
      expect([...requested]).toEqual(["alliance-manager/access.json"]);
    });

    it("serves legitimate branding images with any supported extension", async () => {
      const names = ["1234abcd-0000-4000-8000-000000000000.jpg", "logo.webp", "app_icon-192.AVIF"];
      vi.mocked(get).mockImplementation(
        blobFiles({
          ...accessBlob(cast),
          ...Object.fromEntries(
            names.map((name) => [`alliance-manager/branding/${name}`, { body: name, contentType: "image/png" }]),
          ),
        }),
      );
      signInAs(cast.user);
      for (const name of names) {
        const response = await fetchImage(`alliance-manager/branding/${name}`);
        expect(response.status, name).toBe(200);
        expect(await response.text()).toBe(name);
      }
    });

    it("returns 404 for missing or not-modified blobs", async () => {
      signInAs(cast.user);
      expect((await fetchImage("alliance-manager/branding/missing.png")).status).toBe(404);
      vi.mocked(get).mockImplementation(async (pathname) =>
        pathname === imagePath ? notModifiedResult() : blobFiles(accessBlob(cast))(pathname),
      );
      expect((await fetchImage(imagePath)).status).toBe(404);
    });

    it("returns 503 when Blob fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      signInAs(cast.user);
      vi.mocked(get).mockImplementation(async (pathname) => {
        if (pathname === imagePath) throw new Error("blob down");
        return blobResult(accessBlob(cast)["alliance-manager/access.json"].body, "application/json");
      });
      expect((await fetchImage(imagePath)).status).toBe(503);
    });
  });
});
