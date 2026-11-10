import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData, updateAllianceSettings } from "@/lib/members/access-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { adminRequired, badRequest, unauthorized } from "@/lib/utils/api-responses";

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  return NextResponse.json((await readAccessData()).alliance);
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "admin")) return adminRequired();
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return badRequest("errors.invalid_settings");
  const value = input as Record<string, unknown>;
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 80 ||
    (value.portalCode !== undefined &&
      (typeof value.portalCode !== "string" ||
        (value.portalCode !== "" && !/^[0-9A-F]{12}$/i.test(value.portalCode)))) ||
    (value.galaxy !== undefined &&
      (typeof value.galaxy !== "number" ||
        !Number.isInteger(value.galaxy) ||
        value.galaxy < 0 ||
        value.galaxy > 255)) ||
    typeof value.logoUrl !== "string" ||
    typeof value.bannerUrl !== "string" ||
    typeof value.discordUrl !== "string" ||
    value.discordUrl.length > 300 ||
    !isCommunityInviteUrl(value.discordUrl, ["discord.gg", "discord.com", "t.co"]) ||
    typeof value.telegramUrl !== "string" ||
    value.telegramUrl.length > 300 ||
    !isCommunityInviteUrl(value.telegramUrl, ["t.me", "telegram.me", "t.co"]) ||
    !isIconUrl(value.faviconUrl) ||
    !isIconUrl(value.appleIconUrl) ||
    !isIconUrl(value.appIcon192Url) ||
    !isIconUrl(value.appIcon512Url) ||
    (value.heroGradientMode !== "none" && value.heroGradientMode !== "left" && value.heroGradientMode !== "full")
  ) {
    return badRequest("admin.check_the_alliance_name_images_and_discord_telegram_links");
  }
  const settings = await updateAllianceSettings({
    name: value.name.trim(),
    portalCode: typeof value.portalCode === "string" ? value.portalCode.toUpperCase() : "",
    galaxy: typeof value.galaxy === "number" ? value.galaxy : 0,
    logoUrl: value.logoUrl,
    bannerUrl: value.bannerUrl,
    discordUrl: value.discordUrl.trim(),
    telegramUrl: value.telegramUrl.trim(),
    heroGradientMode: value.heroGradientMode,
    faviconUrl: value.faviconUrl,
    appleIconUrl: value.appleIconUrl,
    appIcon192Url: value.appIcon192Url,
    appIcon512Url: value.appIcon512Url,
  });
  return NextResponse.json(settings);
});

function isIconUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  if (!value) return true;
  try {
    const url = new URL(value, "http://localhost");
    const path = url.searchParams.get("path");
    return (
      url.origin === "http://localhost" &&
      url.pathname === "/api/alliance/image" &&
      url.searchParams.size === 1 &&
      !!path &&
      /^alliance-manager\/branding\/[a-f0-9-]+\.png$/i.test(path)
    );
  } catch {
    return false;
  }
}

function isCommunityInviteUrl(value: string, allowedHosts: readonly string[]) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" && allowedHosts.includes(url.hostname.toLowerCase()) && !url.username && !url.password
    );
  } catch {
    return false;
  }
}
