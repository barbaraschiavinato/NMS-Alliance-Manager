import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

type BlobGetOptions = Readonly<{ access: string; useCache?: boolean; token?: string; storeId?: string }>;
type BlobPutOptions = Readonly<{
  access: string;
  token?: string;
  storeId?: string;
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  contentType?: string;
}>;
type BlobGetResult = { statusCode: 200; stream: ReadableStream<Uint8Array> } | { statusCode: 304; stream: null } | null;

type BlobMock = {
  files: Map<string, string>;
  get: ReturnType<typeof vi.fn<(pathname: string, options: BlobGetOptions) => Promise<BlobGetResult>>>;
  put: ReturnType<
    typeof vi.fn<(pathname: string, body: string, options: BlobPutOptions) => Promise<{ pathname: string }>>
  >;
};

// Store Blob in memoria condivisa tramite globalThis, così sopravvive a vi.resetModules.
const globalStore = globalThis as typeof globalThis & { __storeTestBlobMock?: BlobMock };

function createBlobMock(): BlobMock {
  const files = new Map<string, string>();
  return {
    files,
    get: vi.fn(async (pathname: string) => {
      const text = files.get(pathname);
      if (text === undefined) return null;
      return { statusCode: 200 as const, stream: new Response(text).body! };
    }),
    put: vi.fn(async (pathname: string, body: string) => {
      files.set(pathname, body);
      return { pathname };
    }),
  };
}

export const blobMock: BlobMock = (globalStore.__storeTestBlobMock ??= createBlobMock());

// Da usare con: vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);
export const blobModule = {
  get: (...args: Parameters<BlobMock["get"]>) => blobMock.get(...args),
  put: (...args: Parameters<BlobMock["put"]>) => blobMock.put(...args),
};

export function useBlobBackend(token = "blob-test-token") {
  vi.stubEnv("NMS_READ_WRITE_TOKEN", token);
}

export function setBlobJson(pathname: string, value: unknown) {
  blobMock.files.set(pathname, `${JSON.stringify(value, null, 2)}\n`);
}

export function readBlobJson(pathname: string): unknown {
  const text = blobMock.files.get(pathname);
  return text === undefined ? undefined : JSON.parse(text);
}

export const dataDir = () => path.join(process.cwd(), "data");

export function resetStores() {
  rmSync(dataDir(), { recursive: true, force: true });
  blobMock.files.clear();
  blobMock.get.mockClear();
  blobMock.put.mockClear();
  vi.resetModules();
}

export function dataFileExists(name: string) {
  return existsSync(path.join(dataDir(), name));
}

export function readDataFile(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dataDir(), name), "utf8"));
}

export function readRawDataFile(name: string) {
  return readFileSync(path.join(dataDir(), name), "utf8");
}

export function listDataDir() {
  return existsSync(dataDir()) ? readdirSync(dataDir()) : [];
}

export const blobWriteOptions = (token = "blob-test-token") => ({
  access: "private",
  token,
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
});

export const blobReadOptions = (token = "blob-test-token") => ({ access: "private", useCache: false, token });

// Indirizzi portale validi per decodePortalAddress.
export const portalA = "0123456789AB";
export const portalB = "1ABC12345678";
export const portalC = "2001010010A1";
