import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { isMemberProfileInput, updateMemberProfile } from "@/lib/access-store";

const profileConflictMessages = { name: "members.duplicate_in_game_name", code: "members.duplicate_friend_code" } as const;
export async function GET() {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  return NextResponse.json({
    nmsName: member.nmsName,
    nmsCode: member.nmsCode,
    platforms: member.platforms,
    specialty: member.specialty,
    simpleView: member.simpleView === true,
    role: member.role,
  });
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const input: unknown = await request.json().catch(() => null);
  if (!isMemberProfileInput(input)) {
    return NextResponse.json({ error: "Inserisci nome NMS, codice amico NMS di 13 caratteri alfanumerici e una specializzazione." }, { status: 400 });
  }
  const updated = await updateMemberProfile(member.email, input);
  if (!updated) return NextResponse.json({ error: "Profilo non trovato." }, { status: 404 });
  if (typeof updated === "string") return NextResponse.json({ error: profileConflictMessages[updated] }, { status: 409 });
  return NextResponse.json({
    nmsName: updated.nmsName,
    nmsCode: updated.nmsCode,
    platforms: updated.platforms,
    specialty: updated.specialty,
    simpleView: updated.simpleView === true,
    role: updated.role,
  });
}