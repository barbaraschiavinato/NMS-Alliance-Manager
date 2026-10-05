import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  const data = await readAccessData();
  return NextResponse.json(data.members.filter((item) => item.membershipStatus === "approved" && item.nmsName && /^\d{12}$/.test(item.nmsCode) && item.platforms.length > 0 && item.specialty).map(({ email, name, nmsName, nmsCode, platforms, specialty, role }) => ({
    email,
    name,
    nmsName,
    nmsCode,
    platforms,
    specialty,
    role,
  })));
}