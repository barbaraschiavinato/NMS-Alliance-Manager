import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";

export const GET = withRequestMemo(async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !path.startsWith("alliance-manager/branding/")) {
    return NextResponse.json({ error: "Immagine non trovata." }, { status: 404 });
  }

  try {
    const image = await readImage(path);
    if (!image) return NextResponse.json({ error: "Immagine non trovata." }, { status: 404 });
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read alliance image", error);
    return NextResponse.json({ error: "Impossibile leggere l'immagine." }, { status: 503 });
  }
});
