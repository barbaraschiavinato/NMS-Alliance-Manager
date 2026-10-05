import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { isMemberProfileInput, updateMemberProfile } from "@/lib/access-store";

export async function GET() {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  return NextResponse.json({
    nmsName: member.nmsName,
    nmsCode: member.nmsCode,
    platforms: member.platforms,
    specialty: member.specialty,
    role: member.role,
  });
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const input: unknown = await request.json().catch(() => null);
  if (!isMemberProfileInput(input)) {
    return NextResponse.json({ error: "Inserisci nome NMS, codice amico NMS di 13 caratteri alfanumerici, almeno una piattaforma e una specializzazione." }, { status: 400 });
  }
  const updated = await updateMemberProfile(member.email, input);
  if (!updated) return NextResponse.json({ error: "Profilo non trovato." }, { status: 404 });
  return NextResponse.json({
    nmsName: updated.nmsName,
    nmsCode: updated.nmsCode,
    platforms: updated.platforms,
    specialty: updated.specialty,
    role: updated.role,
  });
}