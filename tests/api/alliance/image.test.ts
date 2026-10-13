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

  it.todo(
    "rejects path traversal such as alliance-manager/branding/../access.json (currently forwarded to Blob get, see report)",
  );

  it("returns 404 when no Blob store is configured", async () => {
    signInAs(cast.user);
    expect((await fetchImage(imagePath)).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
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
