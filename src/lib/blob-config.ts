export function getBlobAuthOptions() {
  const storeId = process.env.NMS_STORE_ID || process.env.BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) return { storeId, oidcToken };

  const token = process.env.NMS_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (token) return { token };

  if (process.env.VERCEL) {
    throw new Error("Configura NMS_READ_WRITE_TOKEN oppure NMS_STORE_ID con VERCEL_OIDC_TOKEN per accedere a Vercel Blob.");
  }
  return null;
}