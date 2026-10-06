import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { getBlobAuthOptions } from "@/lib/blob-config";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxUploadBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "admin")) return NextResponse.json({ error: "Permesso admin richiesto." }, { status: 403 });
  let blobAuthOptions: ReturnType<typeof getBlobAuthOptions>;
  try {
    blobAuthOptions = getBlobAuthOptions();
  } catch {
    return NextResponse.json({ error: "Configura NMS_READ_WRITE_TOKEN oppure NMS_STORE_ID con VERCEL_OIDC_TOKEN per caricare immagini." }, { status: 503 });
  }
  if (!blobAuthOptions) return NextResponse.json({ error: "Configura NMS_READ_WRITE_TOKEN oppure NMS_STORE_ID con VERCEL_OIDC_TOKEN per caricare immagini." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > maxUploadBytes) {
    return NextResponse.json({ error: "Immagine non valida: usa PNG, JPEG, WebP o AVIF fino a 5 MB." }, { status: 400 });
  }

  try {
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const blob = await put(`alliance-manager/branding/${crypto.randomUUID()}.${extension}`, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type,
      ...blobAuthOptions,
    });
    return NextResponse.json({ url: `/api/alliance/image?path=${encodeURIComponent(blob.pathname)}` });
  } catch (error) {
    console.error("Unable to upload alliance image", error);
    return NextResponse.json({ error: "Caricamento immagine non riuscito." }, { status: 503 });
  }
}