import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { getBlobReadWriteToken } from "@/lib/blob-config";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !path.startsWith("alliance-manager/branding/")) {
    return NextResponse.json({ error: "Immagine non trovata." }, { status: 404 });
  }

  try {
    const token = getBlobReadWriteToken();
    if (!token) return NextResponse.json({ error: "Immagine non trovata." }, { status: 404 });
    const blob = await get(path, { access: "private", useCache: false, token });
    if (!blob || blob.statusCode === 304) return NextResponse.json({ error: "Immagine non trovata." }, { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read alliance image", error);
    return NextResponse.json({ error: "Impossibile leggere l'immagine." }, { status: 503 });
  }
}