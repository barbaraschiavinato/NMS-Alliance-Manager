export function getBlobAuthOptions() {
  const storeId = process.env.NMS_STORE_ID || process.env.BLOB_STORE_ID;
  if (storeId && (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN)) return { storeId };

  const token = process.env.NMS_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (token) return { token };

  if (storeId) return { storeId };

  if (process.env.VERCEL) {
    throw new Error("Connect a private Vercel Blob store and configure BLOB_STORE_ID or NMS_STORE_ID to use OIDC.");
  }
  return null;
}