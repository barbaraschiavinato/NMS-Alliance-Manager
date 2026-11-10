import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { storeImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { imageUploadMaxBytes } from "@/lib/utils/limits";
import { adminRequired, apiError, badRequest, unauthorized } from "@/lib/utils/api-responses";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "admin")) return adminRequired();
  try {
    // Throws on Vercel without a Blob store; without any store the images go to the local data folder.
    getBlobAuthOptions();
  } catch {
    return apiError(
      "admin.configure_nms_read_write_token_or_nms_store_id_with_vercel_oidc_token_to_upload_images",
      503,
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > imageUploadMaxBytes) {
    return badRequest("errors.invalid_image_use_png_jpeg_webp_or_avif_up_to_5_mb");
  }

  try {
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const pathname = `alliance-manager/branding/${crypto.randomUUID()}.${extension}`;
    await storeImage(pathname, file);
    return NextResponse.json({ url: `/api/alliance/image?path=${encodeURIComponent(pathname)}` });
  } catch (error) {
    console.error("Unable to upload alliance image", error);
    return apiError("errors.image_upload_failed", 503);
  }
});
