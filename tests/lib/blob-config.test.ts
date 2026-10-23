import { describe, expect, it, vi } from "vitest";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";

describe("getBlobAuthOptions", () => {
  it("uses the local filesystem when nothing is configured", () => {
    expect(getBlobAuthOptions()).toBeNull();
  });

  it("forces the local filesystem in local auth mode, even with Blob settings", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NMS_STORE_ID", "store");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "token");
    expect(getBlobAuthOptions()).toBeNull();
  });

  it("uses OIDC with a store id on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_STORE_ID", "blob-store");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "token");
    expect(getBlobAuthOptions()).toEqual({ storeId: "blob-store" });
  });

  it("uses OIDC with a store id and an OIDC token", () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc");
    vi.stubEnv("NMS_STORE_ID", "nms-store");
    expect(getBlobAuthOptions()).toEqual({ storeId: "nms-store" });
  });

  it("prefers NMS_STORE_ID over BLOB_STORE_ID", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NMS_STORE_ID", "nms-store");
    vi.stubEnv("BLOB_STORE_ID", "blob-store");
    expect(getBlobAuthOptions()).toEqual({ storeId: "nms-store" });
  });

  it("uses a token outside Vercel, preferring NMS_READ_WRITE_TOKEN", () => {
    vi.stubEnv("NMS_STORE_ID", "nms-store");
    vi.stubEnv("NMS_READ_WRITE_TOKEN", "nms-token");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-token");
    expect(getBlobAuthOptions()).toEqual({ token: "nms-token" });
  });

  it("falls back to BLOB_READ_WRITE_TOKEN", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-token");
    expect(getBlobAuthOptions()).toEqual({ token: "blob-token" });
  });

  it("uses a token on Vercel when no store id is set", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-token");
    expect(getBlobAuthOptions()).toEqual({ token: "blob-token" });
  });

  it("uses a bare store id outside Vercel when no token is set", () => {
    vi.stubEnv("BLOB_STORE_ID", "blob-store");
    expect(getBlobAuthOptions()).toEqual({ storeId: "blob-store" });
  });

  it("treats empty values as unset", () => {
    vi.stubEnv("NMS_STORE_ID", "");
    vi.stubEnv("NMS_READ_WRITE_TOKEN", "");
    expect(getBlobAuthOptions()).toBeNull();
  });

  it("refuses to write to the Function filesystem on Vercel without a store", () => {
    vi.stubEnv("VERCEL", "1");
    expect(() => getBlobAuthOptions()).toThrow(/Vercel Blob store/);
  });

  it("throws on Vercel even if LOCAL_AUTH is set", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => getBlobAuthOptions()).toThrow();
  });
});
