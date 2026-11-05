import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { localDataPath } from "@/lib/storage/local-data-path";

const localContentTypes: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

// Without a Blob store the images live under <data dir>/uploads, keeping the same pathnames used on Blob.
function localImagePath(pathname: string) {
  const root = localDataPath("uploads");
  const filePath = path.resolve(root, pathname);
  return filePath.startsWith(root + path.sep) ? filePath : null;
}

export async function storeImage(pathname: string, file: File): Promise<void> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(pathname, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type,
      ...blobAuthOptions,
    });
    return;
  }
  const filePath = localImagePath(pathname);
  if (!filePath) throw new Error("Invalid image path.");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, new Uint8Array(await file.arrayBuffer()));
}

export async function readImage(pathname: string): Promise<{ body: BodyInit; contentType: string } | null> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(pathname, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return null;
    return { body: blob.stream, contentType: blob.blob.contentType };
  }
  const filePath = localImagePath(pathname);
  const contentType = filePath ? localContentTypes[path.extname(filePath).toLowerCase()] : undefined;
  if (!filePath || !contentType) return null;
  try {
    return { body: new Uint8Array(await readFile(filePath)), contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteImage(pathname: string): Promise<void> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await del(pathname, blobAuthOptions);
    return;
  }
  const filePath = localImagePath(pathname);
  if (!filePath) throw new Error("Invalid image path.");
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
