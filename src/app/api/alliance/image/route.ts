import { getCurrentMember } from "@/lib/auth/authorization";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, notFound, unauthorized } from "@/lib/utils/api-responses";

// A single file name inside the branding folder: no further slashes, dots, "%" or other characters
// that could let Blob's URL resolution or the local path step outside it (e.g. "branding/../access.json").
const brandingImagePathPattern = /^alliance-manager\/branding\/[a-z0-9_-]+\.(jpg|png|webp|avif)$/i;

export const GET = withRequestMemo(async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !brandingImagePathPattern.test(path)) {
    return notFound("errors.image_not_found");
  }

  try {
    const image = await readImage(path);
    if (!image) return notFound("errors.image_not_found");
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read alliance image", error);
    return apiError("errors.unable_to_read_the_image", 503);
  }
});
