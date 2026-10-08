import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { linkOfflineMember } from "@/lib/offline-members";
import { createOfflineMember, updateOfflineMember, isMemberProfileInput, deleteMember, readAccessData, memberRoles, updateMemberApproval, updateMemberRole } from "@/lib/access-store";
import { readMissions, writeMissions } from "@/lib/store";
import { membershipStatuses } from "@/lib/member-types";

const profileConflictMessages = { name: "members.duplicate_in_game_name", code: "members.duplicate_friend_code" } as const;
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  const protectedAdminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  return NextResponse.json((await readAccessData()).members.map((profile) => ({
    ...profile,
    protectedAdmin: profile.email.trim().toLowerCase() === protectedAdminEmail,
  })));
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Dati ruolo non validi." }, { status: 400 });
  const { email, role, membershipStatus } = input as Record<string, unknown>;
  if (typeof email !== "string") return NextResponse.json({ error: "Email non valida." }, { status: 400 });

  if (membershipStatus !== undefined) {
    if (typeof membershipStatus !== "string" || !membershipStatuses.includes(membershipStatus as (typeof membershipStatuses)[number])) {
      return NextResponse.json({ error: "Stato approvazione non valido." }, { status: 400 });
    }
    const updated = await updateMemberApproval(email, member.email, membershipStatus as (typeof membershipStatuses)[number], member.role);
    if (!updated) return NextResponse.json({ error: "Utente non trovato o non modificabile." }, { status: 404 });
    return NextResponse.json({ ok: true, membershipStatus: updated.membershipStatus });
  }

  if (!hasRole(member, "admin")) return NextResponse.json({ error: "Solo un admin può cambiare i ruoli." }, { status: 403 });
  if (typeof role !== "string" || !memberRoles.includes(role as (typeof memberRoles)[number])) {
    return NextResponse.json({ error: "Ruolo non valido." }, { status: 400 });
  }
  const updated = await updateMemberRole(email, role as (typeof memberRoles)[number]);
  if (!updated) return NextResponse.json({ error: "Utente non trovato o ruolo non modificabile." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || typeof (input as Record<string, unknown>).email !== "string") {
    return NextResponse.json({ error: "Email membro non valida." }, { status: 400 });
  }
  const removedEmail = (input as { email: string }).email.trim().toLowerCase();
  const access = await readAccessData();
  const removedMember = access.members.find((candidate) => candidate.email === removedEmail);
  const adminMember = access.members.find((candidate) => candidate.email === process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase());
  const removed = await deleteMember((input as { email: string }).email, member.role, member.email);
  if (!removed) return NextResponse.json({ error: "Membro non trovato o non eliminabile con il tuo ruolo." }, { status: 404 });
  if (removedMember && adminMember) {
    const missions = await readMissions();
    if (missions.some((mission) => mission.stationOwnerMemberId === removedMember.publicId)) {
      await writeMissions(missions.map((mission) => mission.stationOwnerMemberId === removedMember.publicId
        ? { ...mission, stationOwnerMemberId: adminMember.publicId, stationOwnerName: adminMember.nmsName || adminMember.name }
        : mission));
    }
  }
  return NextResponse.json({ ok: true });
}
export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  const { action } = input as Record<string, unknown>;

  if (action === "link") {
    const { offlineId, targetId } = input as Record<string, unknown>;
    if (typeof offlineId !== "string" || typeof targetId !== "string" || !(await linkOfflineMember(offlineId, targetId))) {
      return NextResponse.json({ error: "Impossibile collegare il profilo." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!isMemberProfileInput(input)) return NextResponse.json({ error: "Profilo non valido." }, { status: 400 });
  if (action === "update") {
    const { offlineId } = input as unknown as Record<string, unknown>;
    const updated = typeof offlineId === "string" ? await updateOfflineMember(offlineId, input) : null;
    if (!updated) return NextResponse.json({ error: "Giocatore offline non trovato." }, { status: 404 });
    if (typeof updated === "string") return NextResponse.json({ error: profileConflictMessages[updated] }, { status: 409 });
    return NextResponse.json(updated);
  }
  const created = await createOfflineMember(input, member.email);
  if (typeof created === "string") return NextResponse.json({ error: profileConflictMessages[created] }, { status: 409 });
  return NextResponse.json(created, { status: 201 });
}
