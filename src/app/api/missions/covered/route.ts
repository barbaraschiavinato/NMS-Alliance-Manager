import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { coveredSpecialties } from "@/lib/missions";
import { readMissions } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  try {
    const covered: Record<string, string[]> = {};
    for (const mission of await readMissions()) {
      const key = `${mission.galaxy}:${mission.systemAddress.toUpperCase()}`;
      covered[key] = [...new Set([...(covered[key] ?? []), ...coveredSpecialties(mission.targetSpecialty)])];
    }
    return NextResponse.json({ covered });
  } catch (error) {
    console.error("Unable to read covered specialties", error);
    return NextResponse.json({ error: "Impossibile leggere le missioni." }, { status: 503 });
  }
}
