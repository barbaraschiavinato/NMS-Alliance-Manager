import { get, put } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { seedMembers } from "../../helpers/members";
import { accessBlob, blobFiles, castMembers, makeCast, resetData, type Cast } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));

const url = "http://localhost:3000/api/admin/upload";
let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  vi.mocked(get).mockImplementation(blobFiles(accessBlob(cast)));
});

async function upload(body: FormData | string) {
  const { POST } = await import("@/app/api/admin/upload/route");
  return POST(new Request(url, { method: "POST", body }));
}

function imageForm(type = "image/png", size = 16, name = "logo.png") {
  const form = new FormData();
  form.append("image", new File([new Uint8Array(size)], name, { type }));
  return form;
}

describe("POST /api/admin/upload", () => {
  it("returns 401 without a session or for pending/blocked members", async () => {
    signInAs(null);
    expect((await upload(imageForm())).status).toBe(401);
    for (const member of [cast.pending, cast.blocked]) {
      signInAs(member);
      expect((await upload(imageForm())).status).toBe(401);
    }
  });

  it("returns 403 for users, moderators and simple-view admins", async () => {
    for (const member of [cast.user, cast.moderator, cast.simpleAdmin]) {
      signInAs(member);
      const response = await upload(imageForm());
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Permesso admin richiesto." });
    }
    expect(put).not.toHaveBeenCalled();
  });

  it("returns 503 when no Blob store is configured", async () => {
    signInAs(cast.admin);
    expect((await upload(imageForm())).status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });

  it("returns 503 when the Blob configuration is invalid", async () => {
    const authorization = await import("@/lib/auth/authorization");
    vi.spyOn(authorization, "getCurrentMember").mockResolvedValue(cast.admin);
    vi.stubEnv("VERCEL", "1");
    expect((await upload(imageForm())).status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });

  describe("with a Blob store", () => {
    beforeEach(() => {
      vi.stubEnv("NMS_READ_WRITE_TOKEN", "blob-token");
      signInAs(cast.admin);
    });

    it("rejects missing files, wrong types, oversized images and non-multipart bodies", async () => {
      const textForm = new FormData();
      textForm.append("image", "not a file");
      for (const body of [
        new FormData(),
        textForm,
        imageForm("image/gif"),
        imageForm("image/png", 5 * 1024 * 1024 + 1),
        "plain text",
      ]) {
        const response = await upload(body);
        expect(response.status).toBe(400);
      }
      expect(put).not.toHaveBeenCalled();
    });

    it("uploads a private branding image and returns its proxy URL", async () => {
      vi.mocked(put).mockImplementation(async (pathname) => ({
        pathname,
        url: `https://blob.example/${pathname}`,
        downloadUrl: `https://blob.example/${pathname}?download=1`,
        contentType: "image/jpeg",
        contentDisposition: "inline",
        etag: "etag",
      }));
      const response = await upload(imageForm("image/jpeg", 5 * 1024 * 1024, "photo.jpeg"));
      expect(response.status).toBe(200);
      const [pathname, , options] = vi.mocked(put).mock.calls[0];
      expect(pathname).toMatch(/^alliance-manager\/branding\/[\da-f-]{36}\.jpg$/);
      expect(options).toMatchObject({
        access: "private",
        addRandomSuffix: false,
        contentType: "image/jpeg",
        token: "blob-token",
      });
      expect(await response.json()).toEqual({ url: `/api/alliance/image?path=${encodeURIComponent(pathname)}` });
    });

    it("returns 503 when the upload fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(put).mockRejectedValue(new Error("network down"));
      const response = await upload(imageForm("image/webp"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Caricamento immagine non riuscito." });
    });
  });
});
