export function getBlobAuthOptions() {
  const localBlobOptIn = process.env.NMS_USE_BLOB_IN_DEV === "true";
  if (process.env.NODE_ENV !== "production" && !localBlobOptIn) return null;

  const token = process.env.NMS_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (token) return { token };

  if (!process.env.VERCEL) return null;

  const storeId = process.env.NMS_STORE_ID || process.env.BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) return { storeId, oidcToken };

  throw new Error("Configura NMS_READ_WRITE_TOKEN oppure collega uno store con NMS_STORE_ID e VERCEL_OIDC_TOKEN per accedere a Vercel Blob.");
}