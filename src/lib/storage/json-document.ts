import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { localDataPath } from "@/lib/storage/local-data-path";
import { clearRequestMemo } from "@/lib/storage/request-memo";

// Whole JSON documents shared by the stores. A document name such as "farms" lives at alliance-manager/farms.json on
// Vercel Blob and at <data dir>/farms.json on the local backend (see getBlobAuthOptions). Stores keep only their own
// normalisation, migrations and request memoization (memoizedRead) on top of these two functions.

export function blobDocumentPath(name: string) {
  return `alliance-manager/${name}.json`;
}

// Resolved at call time, so NMS_DATA_DIR and the working directory are read when the document is used.
export function localDocumentPath(name: string) {
  return localDataPath(`${name}.json`);
}

export type ReadJsonDocumentOptions = Readonly<{
  // Local backend only: a file that is not valid JSON is renamed to <file>.corrupt-<timestamp> and read as missing.
  // Only for documents that can be rebuilt (the Almanac cache).
  quarantineCorruptLocalFile?: boolean;
}>;

// Returns the parsed document, or undefined when it does not exist yet.
export async function readJsonDocument(name: string, options: ReadJsonDocumentOptions = {}): Promise<unknown> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobDocumentPath(name), { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return undefined;
    return JSON.parse(await new Response(blob.stream).text());
  }

  const filePath = localDocumentPath(name);
  let json: string;
  try {
    json = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    if (!options.quarantineCorruptLocalFile || !(error instanceof SyntaxError)) throw error;
    console.error(`Unreadable ${name}.json, starting from an empty document`, error);
    await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined);
    return undefined;
  }
}

// Replaces the whole document (read-modify-write, no locking) and always clears the request memo, because derived
// values in other documents may depend on it.
export async function writeJsonDocument(name: string, data: unknown): Promise<void> {
  try {
    await writeJsonDocumentToStore(name, `${JSON.stringify(data, null, 2)}\n`);
  } finally {
    clearRequestMemo();
  }
}

async function writeJsonDocumentToStore(name: string, json: string): Promise<void> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(blobDocumentPath(name), json, {
      access: "private",
      ...blobAuthOptions,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const filePath = localDocumentPath(name);
  await mkdir(path.dirname(filePath), { recursive: true });
  // Write a temporary file and rename it, so a reader never sees a half-written document.
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, json, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}
