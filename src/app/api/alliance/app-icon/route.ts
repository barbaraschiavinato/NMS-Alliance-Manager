import { readAccessData } from "@/lib/members/access-store";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iconSettings = {
  "32": "faviconUrl",
  "180": "appleIconUrl",
  "192": "appIcon192Url",
  "512": "appIcon512Url",
} as const;

export const GET = withRequestMemo(async function GET(request: Request) {
  const size = new URL(request.url).searchParams.get("size");
  if (!size || !Object.hasOwn(iconSettings, size)) {
    return notFound("errors.icon_not_found");
  }

  const iconUrl = (await readAccessData()).alliance[iconSettings[size as keyof typeof iconSettings]];
  if (!iconUrl) return notFound("errors.icon_not_configured");

  let path: string;
  try {
    const url = new URL(iconUrl, "http://localhost");
    if (url.pathname !== "/api/alliance/image") {
      return notFound("errors.icon_not_found");
    }
    path = url.searchParams.get("path") ?? "";
  } catch {
    return notFound("errors.invalid_icon");
  }

  if (!/^alliance-manager\/branding\/[a-f0-9-]+\.png$/i.test(path)) {
    return notFound("errors.icon_not_found");
  }

  try {
    const image = await readImage(path);
    if (!image || image.contentType !== "image/png") {
      return notFound("errors.icon_not_found");
    }
    return new Response(image.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read public alliance app icon", error);
    return apiError("errors.unable_to_read_the_icon", 503);
  }
});
