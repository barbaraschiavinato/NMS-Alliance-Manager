import type { AllianceMember } from "@/lib/members/member-types";
import { readAllStationPortals, readStationPortals, type OwnedStationPortal } from "@/lib/stations/stations-store";

export async function readVisibleStationPortals(member: AllianceMember): Promise<OwnedStationPortal[]> {
  const canViewAll =
    member.role === "admin" ||
    member.role === "moderator" ||
    member.specialty === "ranger" ||
    member.specialty === "explorer" ||
    member.specialty === "builder";
  if (canViewAll) return readAllStationPortals();
  return (await readStationPortals(member.publicId)).map((station) => ({ ...station, ownerId: member.publicId }));
}
