import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { storeImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxUploadBytes = 5 * 1024 * 1024;

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "admin")) return NextResponse.json({ error: "Permesso admin richiesto." }, { status: 403 });
  try {
    // Throws on Vercel without a Blob store; without any store the images go to the local data folder.
    getBlobAuthOptions();
  } catch {
    return NextResponse.json(
      { error: "Configura NMS_READ_WRITE_TOKEN oppure NMS_STORE_ID con VERCEL_OIDC_TOKEN per caricare immagini." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: "Immagine non valida: usa PNG, JPEG, WebP o AVIF fino a 5 MB." },
      { status: 400 },
    );
  }

  try {
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const pathname = `alliance-manager/branding/${crypto.randomUUID()}.${extension}`;
    await storeImage(pathname, file);
    return NextResponse.json({ url: `/api/alliance/image?path=${encodeURIComponent(pathname)}` });
  } catch (error) {
    console.error("Unable to upload alliance image", error);
    return NextResponse.json({ error: "Caricamento immagine non riuscito." }, { status: 503 });
  }
});
