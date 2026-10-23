import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { isMemberProfileInput, updateMemberProfile } from "@/lib/members/access-store";
import { isFixedLocalAccount } from "@/lib/auth/local-auth";
import { normalizeNmsFriendCode, type AllianceMember } from "@/lib/members/member-types";

const profileConflictMessages = {
  name: "members.duplicate_in_game_name",
  code: "members.duplicate_friend_code",
} as const;

// The view toggle in the header sends the whole profile unchanged, so only real field changes count.
function profileFieldsChanged(member: AllianceMember, input: Parameters<typeof updateMemberProfile>[1]) {
  const platforms = new Set(input.platforms);
  return (
    input.nmsName.trim() !== member.nmsName ||
    normalizeNmsFriendCode(input.nmsCode) !== member.nmsCode ||
    (input.telegramName ?? "").trim() !== (member.telegramName ?? "") ||
    (input.discordName ?? "").trim() !== (member.discordName ?? "") ||
    input.specialty !== member.specialty ||
    (input.pulseEffectsEnabled !== undefined && input.pulseEffectsEnabled !== (member.pulseEffectsEnabled !== false)) ||
    platforms.size !== member.platforms.length ||
    member.platforms.some((platform) => !platforms.has(platform))
  );
}
export async function GET() {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  return NextResponse.json({
    nmsName: member.nmsName,
    nmsCode: member.nmsCode,
    telegramName: member.telegramName ?? "",
    discordName: member.discordName ?? "",
    platforms: member.platforms,
    specialty: member.specialty,
    simpleView: member.simpleView === true,
    pulseEffectsEnabled: member.pulseEffectsEnabled !== false,
    role: member.role,
  });
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember({ allowPending: true });
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const input: unknown = await request.json().catch(() => null);
  if (!isMemberProfileInput(input)) {
    return NextResponse.json(
      { error: "Inserisci nome NMS, codice amico NMS di 13 caratteri alfanumerici e una specializzazione." },
      { status: 400 },
    );
  }
  if (isFixedLocalAccount(member.email) && profileFieldsChanged(member, input)) {
    return NextResponse.json(
      { error: "Questo account locale è fisso per i test: il profilo non è modificabile." },
      { status: 403 },
    );
  }
  const updated = await updateMemberProfile(member.email, input);
  if (!updated) return NextResponse.json({ error: "Profilo non trovato." }, { status: 404 });
  if (typeof updated === "string")
    return NextResponse.json({ error: profileConflictMessages[updated] }, { status: 409 });
  return NextResponse.json({
    nmsName: updated.nmsName,
    nmsCode: updated.nmsCode,
    telegramName: updated.telegramName ?? "",
    discordName: updated.discordName ?? "",
    platforms: updated.platforms,
    specialty: updated.specialty,
    simpleView: updated.simpleView === true,
    pulseEffectsEnabled: updated.pulseEffectsEnabled !== false,
    role: updated.role,
  });
}
