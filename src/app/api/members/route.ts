import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { isEmailAddress, isValidNmsFriendCode } from "@/lib/member-types";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const data = await readAccessData();
  const searchParams = new URL(request.url).searchParams;
  const requestedIds = searchParams.get("ids");
  if (requestedIds) {
    const ids = new Set(requestedIds.split(",").map((id) => id.trim()).filter(Boolean));
    return NextResponse.json(data.members
      .filter((profile) => profile.membershipStatus === "approved" && ids.has(profile.publicId))
      .map(({ publicId, image }) => ({ publicId, image })));
  }
  const publicId = searchParams.get("id")?.trim();
  if (publicId) {
    const profile = data.members.find((candidate) => candidate.publicId === publicId && candidate.membershipStatus === "approved");
    if (!profile) return NextResponse.json({ error: "Profilo membro non trovato." }, { status: 404 });
    return NextResponse.json({
      publicId: profile.publicId,
      name: isEmailAddress(profile.name) ? "" : profile.name,
      image: profile.image,
      nmsName: isEmailAddress(profile.nmsName) ? "" : profile.nmsName,
      platforms: profile.platforms,
      specialty: profile.specialty,
      offline: profile.offline === true,
      ...(hasRole(member, "moderator") ? { ...(profile.offline ? {} : { email: profile.email }), nmsCode: profile.nmsCode, role: profile.role } : {}),
    });
  }
  if (!hasRole(member, "moderator")) return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  return NextResponse.json(data.members.filter((item) => item.membershipStatus === "approved" && item.nmsName && isValidNmsFriendCode(item.nmsCode) && item.specialty).map(({ publicId, email, name, image, nmsName, nmsCode, platforms, specialty, role }) => ({
    publicId,
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