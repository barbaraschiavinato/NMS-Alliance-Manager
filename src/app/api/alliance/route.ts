import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData, updateAllianceSettings } from "@/lib/access-store";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  return NextResponse.json((await readAccessData()).alliance);
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "admin")) return NextResponse.json({ error: "Permesso admin richiesto." }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Impostazioni non valide." }, { status: 400 });
  const value = input as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80 ||
      typeof value.logoUrl !== "string" || typeof value.bannerUrl !== "string" ||
      (value.defaultTableView !== "list" && value.defaultTableView !== "cards")) {
    return NextResponse.json({ error: "Nome o immagini alleanza non validi." }, { status: 400 });
  }
  const settings = await updateAllianceSettings({
    name: value.name.trim(),
    logoUrl: value.logoUrl,
    bannerUrl: value.bannerUrl,
    defaultTableView: value.defaultTableView,
  });
  return NextResponse.json(settings);
}