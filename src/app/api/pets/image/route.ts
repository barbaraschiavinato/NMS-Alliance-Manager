import { getCurrentMember } from "@/lib/auth/authorization";
import { petImagePathPattern } from "@/lib/pets/pets";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestMemo(async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("pets.error_access_required", 401);
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!petImagePathPattern.test(path)) return notFound("pets.error_not_found");
  try {
    const image = await readImage(path);
    if (!image) return notFound("pets.error_not_found");
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read pet image", error);
    return apiError("pets.error_unable_to_read", 503);
  }
});
