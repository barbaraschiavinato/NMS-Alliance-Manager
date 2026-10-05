import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { deleteMember, readAccessData, memberRoles, updateMemberApproval, updateMemberRole } from "@/lib/access-store";
import { membershipStatuses } from "@/lib/member-types";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  return NextResponse.json((await readAccessData()).members);
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
  const removed = await deleteMember((input as { email: string }).email, member.role);
  if (!removed) return NextResponse.json({ error: "Membro non trovato o non eliminabile con il tuo ruolo." }, { status: 404 });
  return NextResponse.json({ ok: true });
}