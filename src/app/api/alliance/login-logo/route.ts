import { readAccessData } from "@/lib/members/access-store";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const GET = withRequestMemo(async function GET() {
  const logoUrl = (await readAccessData()).alliance.logoUrl;
  if (!logoUrl) return notFound("admin.logo_is_not_configured");

  let path: string;
  try {
    const url = new URL(logoUrl, "http://localhost");
    if (url.pathname !== "/api/alliance/image") {
      return notFound("errors.logo_not_found");
    }
    path = url.searchParams.get("path") ?? "";
  } catch {
    return notFound("errors.invalid_logo");
  }

  if (!/^alliance-manager\/branding\/[a-f0-9-]+\.(jpg|png|webp|avif)$/i.test(path)) {
    return notFound("errors.logo_not_found");
  }

  try {
    const image = await readImage(path);
    if (!image || !allowedImageTypes.has(image.contentType)) {
      return notFound("errors.logo_not_found");
    }

    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read public alliance login logo", error);
    return apiError("errors.unable_to_read_the_logo", 503);
  }
});
