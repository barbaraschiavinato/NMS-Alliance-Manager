import { NextResponse } from "next/server";
import { readAccessData } from "@/lib/members/access-store";
import { readImage } from "@/lib/storage/image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function GET() {
  const logoUrl = (await readAccessData()).alliance.logoUrl;
  if (!logoUrl) return NextResponse.json({ error: "Logo non configurato." }, { status: 404 });

  let path: string;
  try {
    const url = new URL(logoUrl, "http://localhost");
    if (url.pathname !== "/api/alliance/image") {
      return NextResponse.json({ error: "Logo non trovato." }, { status: 404 });
    }
    path = url.searchParams.get("path") ?? "";
  } catch {
    return NextResponse.json({ error: "Logo non valido." }, { status: 404 });
  }

  if (!/^alliance-manager\/branding\/[a-f0-9-]+\.(jpg|png|webp|avif)$/i.test(path)) {
    return NextResponse.json({ error: "Logo non trovato." }, { status: 404 });
  }

  try {
    const image = await readImage(path);
    if (!image || !allowedImageTypes.has(image.contentType)) {
      return NextResponse.json({ error: "Logo non trovato." }, { status: 404 });
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
    return NextResponse.json({ error: "Impossibile leggere il logo." }, { status: 503 });
  }
}
