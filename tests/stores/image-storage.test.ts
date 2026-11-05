import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteImage, readImage, storeImage } from "@/lib/storage/image-storage";

vi.mock("@vercel/blob", () => ({ del: vi.fn(), get: vi.fn(), put: vi.fn() }));

const pathname = "alliance-manager/branding/1234abcd-0000-4000-8000-000000000000.png";
const uploadsDir = () => path.join(process.cwd(), "data", "uploads");

function pngFile(content = "PNGDATA") {
  return new File([content], "logo.png", { type: "image/png" });
}

beforeEach(() => {
  rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
  vi.mocked(get).mockReset();
  vi.mocked(put).mockReset();
  vi.mocked(del).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("image storage without a Blob store", () => {
  it("writes the image under data/uploads and reads it back with its content type", async () => {
    await storeImage(pathname, pngFile());
    expect(existsSync(path.join(uploadsDir(), pathname))).toBe(true);

    const image = await readImage(pathname);
    expect(image?.contentType).toBe("image/png");
    expect(await new Response(image?.body).text()).toBe("PNGDATA");
    expect(put).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("returns null for a missing image", async () => {
    expect(await readImage(pathname)).toBeNull();
  });

  it("rethrows read errors other than a missing file", async () => {
    mkdirSync(path.join(uploadsDir(), pathname), { recursive: true });
    await expect(readImage(pathname)).rejects.toThrow();
  });

  it("derives the content type from the extension and ignores other files", async () => {
    mkdirSync(path.join(uploadsDir(), "alliance-manager/branding"), { recursive: true });
    writeFileSync(path.join(uploadsDir(), "alliance-manager/branding/photo.webp"), "WEBP");
    writeFileSync(path.join(uploadsDir(), "alliance-manager/branding/notes.json"), "{}");

    expect((await readImage("alliance-manager/branding/photo.webp"))?.contentType).toBe("image/webp");
    expect(await readImage("alliance-manager/branding/notes.json")).toBeNull();
  });

  it("rejects paths that escape the uploads folder", async () => {
    await expect(storeImage("../../outside.png", pngFile())).rejects.toThrow("Invalid image path.");
    expect(existsSync(path.join(process.cwd(), "outside.png"))).toBe(false);
    expect(await readImage("../../data/access.png")).toBeNull();
  });

  it("deletes a stored image and ignores one that is already gone", async () => {
    await storeImage(pathname, pngFile());
    await deleteImage(pathname);
    expect(existsSync(path.join(uploadsDir(), pathname))).toBe(false);
    await expect(deleteImage(pathname)).resolves.toBeUndefined();
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses to delete paths outside the uploads folder and rethrows other errors", async () => {
    await expect(deleteImage("../../outside.png")).rejects.toThrow("Invalid image path.");
    mkdirSync(path.join(uploadsDir(), pathname), { recursive: true });
    await expect(deleteImage(pathname)).rejects.toThrow();
  });
});

describe("image storage with a Blob store", () => {
  beforeEach(() => {
    vi.stubEnv("NMS_READ_WRITE_TOKEN", "blob-token");
  });

  it("uploads to a private Blob and does not touch the local folder", async () => {
    await storeImage(pathname, pngFile());
    expect(put).toHaveBeenCalledWith(
      pathname,
      expect.any(File),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        contentType: "image/png",
        token: "blob-token",
      }),
    );
    expect(existsSync(uploadsDir())).toBe(false);
  });

  it("deletes from Blob without touching the local folder", async () => {
    await deleteImage(pathname);
    expect(del).toHaveBeenCalledWith(pathname, expect.objectContaining({ token: "blob-token" }));
  });

  it("reads from Blob and treats missing or not-modified blobs as not found", async () => {
    const stream = new Response("PNGDATA").body!;
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream,
      blob: { contentType: "image/png" },
    } as unknown as Awaited<ReturnType<typeof get>>);
    const image = await readImage(pathname);
    expect(image?.contentType).toBe("image/png");
    expect(await new Response(image?.body).text()).toBe("PNGDATA");
    expect(get).toHaveBeenCalledWith(
      pathname,
      expect.objectContaining({ access: "private", useCache: false, token: "blob-token" }),
    );

    vi.mocked(get).mockResolvedValueOnce(null);
    expect(await readImage(pathname)).toBeNull();
    vi.mocked(get).mockResolvedValueOnce({ statusCode: 304 } as unknown as Awaited<ReturnType<typeof get>>);
    expect(await readImage(pathname)).toBeNull();
  });
});
