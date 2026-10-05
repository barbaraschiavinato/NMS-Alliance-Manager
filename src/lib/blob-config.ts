export function getBlobReadWriteToken() {
  const token = process.env.NMS_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (process.env.VERCEL && !token) {
    throw new Error("Configura NMS_READ_WRITE_TOKEN per accedere a Vercel Blob.");
  }
  return token;
}