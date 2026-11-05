import { NextResponse } from "next/server";
import { readAccessData } from "@/lib/members/access-store";
import { readImage } from "@/lib/storage/image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iconSettings = {
  "32": "faviconUrl",
  "180": "appleIconUrl",
  "192": "appIcon192Url",
  "512": "appIcon512Url",
} as const;

export async function GET(request: Request) {
  const size = new URL(request.url).searchParams.get("size");
  if (!size || !Object.hasOwn(iconSettings, size)) {
    return NextResponse.json({ error: "Icona non trovata." }, { status: 404 });
  }

  const iconUrl = (await readAccessData()).alliance[iconSettings[size as keyof typeof iconSettings]];
  if (!iconUrl) return NextResponse.json({ error: "Icona non configurata." }, { status: 404 });

  let path: string;
  try {
    const url = new URL(iconUrl, "http://localhost");
    if (url.pathname !== "/api/alliance/image") {
      return NextResponse.json({ error: "Icona non trovata." }, { status: 404 });
    }
    path = url.searchParams.get("path") ?? "";
  } catch {
    return NextResponse.json({ error: "Icona non valida." }, { status: 404 });
  }

  if (!/^alliance-manager\/branding\/[a-f0-9-]+\.png$/i.test(path)) {
    return NextResponse.json({ error: "Icona non trovata." }, { status: 404 });
  }

  try {
    const image = await readImage(path);
    if (!image || image.contentType !== "image/png") {
      return NextResponse.json({ error: "Icona non trovata." }, { status: 404 });
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
    return NextResponse.json({ error: "Impossibile leggere l'icona." }, { status: 503 });
  }
}
