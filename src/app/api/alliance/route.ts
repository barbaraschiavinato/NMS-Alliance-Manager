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
      typeof value.discordUrl !== "string" || value.discordUrl.length > 300 || !isCommunityInviteUrl(value.discordUrl, ["discord.gg", "discord.com", "t.co"]) ||
      typeof value.telegramUrl !== "string" || value.telegramUrl.length > 300 || !isCommunityInviteUrl(value.telegramUrl, ["t.me", "telegram.me", "t.co"]) ||
      (value.heroGradientMode !== "none" && value.heroGradientMode !== "left" && value.heroGradientMode !== "full")) {
    return NextResponse.json({ error: "Controlla il nome, le immagini e i link Discord/Telegram." }, { status: 400 });
  }
  const settings = await updateAllianceSettings({
    name: value.name.trim(),
    logoUrl: value.logoUrl,
    bannerUrl: value.bannerUrl,
    discordUrl: value.discordUrl.trim(),
    telegramUrl: value.telegramUrl.trim(),
    heroGradientMode: value.heroGradientMode,
  });
  return NextResponse.json(settings);
}

function isCommunityInviteUrl(value: string, allowedHosts: readonly string[]) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" &&
      allowedHosts.includes(url.hostname.toLowerCase()) &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}