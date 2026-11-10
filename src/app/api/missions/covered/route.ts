import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { coveredSpecialties } from "@/lib/missions/missions";
import { readMissions } from "@/lib/missions/store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  try {
    const covered: Record<string, string[]> = {};
    for (const mission of await readMissions()) {
      const key = `${mission.galaxy}:${mission.systemAddress.toUpperCase()}`;
      covered[key] = [...new Set([...(covered[key] ?? []), ...coveredSpecialties(mission.targetSpecialty)])];
    }
    return NextResponse.json({ covered });
  } catch (error) {
    console.error("Unable to read covered specialties", error);
    return apiError("errors.unable_to_read_missions", 503);
  }
});
