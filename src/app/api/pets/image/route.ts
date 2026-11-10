import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { petImagePathPattern } from "@/lib/pets/pets";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestMemo(async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "pets.error_access_required" }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!petImagePathPattern.test(path)) return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
  try {
    const image = await readImage(path);
    if (!image) return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read pet image", error);
    return NextResponse.json({ error: "pets.error_unable_to_read" }, { status: 503 });
  }
});
