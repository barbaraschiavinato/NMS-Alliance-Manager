import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { isValidNmsFriendCode } from "@/lib/member-types";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const data = await readAccessData();
  const searchParams = new URL(request.url).searchParams;
  const requestedEmails = searchParams.get("emails");
  if (requestedEmails) {
    const emails = new Set(requestedEmails.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
    return NextResponse.json(data.members
      .filter((profile) => profile.membershipStatus === "approved" && emails.has(profile.email))
      .map(({ email, image }) => ({ email, image })));
  }
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (email) {
    const profile = data.members.find((candidate) => candidate.email === email && candidate.membershipStatus === "approved");
    if (!profile) return NextResponse.json({ error: "Profilo membro non trovato." }, { status: 404 });
    return NextResponse.json({
      name: profile.name,
      image: profile.image,
      nmsName: profile.nmsName,
      platforms: profile.platforms,
      specialty: profile.specialty,
      ...(hasRole(member, "moderator") ? { email: profile.email, nmsCode: profile.nmsCode, role: profile.role } : {}),
    });
  }
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  return NextResponse.json(data.members.filter((item) => item.membershipStatus === "approved" && item.nmsName && isValidNmsFriendCode(item.nmsCode) && item.platforms.length > 0 && item.specialty).map(({ email, name, image, nmsName, nmsCode, platforms, specialty, role }) => ({
    email,
    name,
    image,
    nmsName,
    nmsCode,
    platforms,
    specialty,
    role,
  })));
}