import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData, type AllianceMember } from "@/lib/access-store";
import { readAlmanacResponse, readAlmanacResponses, writeAlmanacResponse } from "@/lib/almanac-store";
import { decodePortalAddress, missionSpecialties, type MissionSpecialty } from "@/lib/missions";
import { isEmailAddress } from "@/lib/member-types";
import { addStationPortal, readAllStationPortals, readStationPortals, removeStationPortal, updateStationPortal } from "@/lib/stations-store";
import { readMissions, writeMissions } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "stations.error_access_required" }, { status: 401 });
  try {
    return NextResponse.json({ stations: await readStations(member) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read station portals", error);
    return NextResponse.json({ error: "stations.error_unable_to_read_stations" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "stations.error_access_required" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const portal = typeof payload.portal === "string"
    ? payload.portal.toUpperCase()
    : "";
  const galaxy = payload.galaxy;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const requestedOwnerId = typeof payload.ownerId === "string" ? payload.ownerId.trim() : member.publicId;
  const decoded = decodePortalAddress(portal);
  if (!decoded || decoded.errors.length > 0 || typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) {
    return NextResponse.json({ error: "stations.error_invalid_portal_and_galaxy" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "stations.error_station_name_too_long" }, { status: 400 });
  }
  if (note.length > 1000) {
    return NextResponse.json({ error: "stations.error_station_note_too_long" }, { status: 400 });
  }
  try {
    const accessData = await readAccessData();
    const isModerator = hasRole(member, "moderator");
    const ownerMember = accessData.members.find((candidate) =>
      candidate.publicId === requestedOwnerId && candidate.membershipStatus === "approved",
    );
    if (!ownerMember) {
      return NextResponse.json({ error: "stations.error_owner_must_be_approved" }, { status: 400 });
    }
    if (!isModerator && ownerMember.publicId !== member.publicId) {
      return NextResponse.json({ error: "stations.error_cannot_create_stations_for_another_member" }, { status: 403 });
    }
    if ((await readStationPortals(ownerMember.publicId)).some((station) => station.portal === portal && station.galaxy === galaxy)) {
      return NextResponse.json({ error: "stations.this_portal_is_already_in_the_selected_owner_s_list" }, { status: 409 });
    }
    await addStationPortal(ownerMember.publicId, portal, galaxy, name, member.publicId, note);
    await cacheStationPlanet(portal, galaxy);
    return NextResponse.json({ stations: await readStations(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save station portal", error);
    return NextResponse.json({ error: "stations.error_unable_to_save_station" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "stations.error_access_required" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const portal = typeof payload.portal === "string"
    ? payload.portal.toUpperCase()
    : "";
  const galaxy = payload.galaxy;
  const ownerId = typeof payload.ownerId === "string" ? payload.ownerId.trim() : "";
  const decoded = decodePortalAddress(portal);
  if (!decoded || decoded.errors.length > 0 || typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) {
    return NextResponse.json({ error: "stations.error_invalid_portal_or_galaxy" }, { status: 400 });
  }

  try {
    const accessData = await readAccessData();
    const isModerator = hasRole(member, "moderator");
    const ownerMember = accessData.members.find((candidate) =>
      candidate.publicId === (ownerId || member.publicId) && candidate.membershipStatus === "approved",
    );
    if (!ownerMember) return NextResponse.json({ error: "stations.error_invalid_station_owner" }, { status: 400 });
    if (!isModerator && ownerMember.publicId !== member.publicId) {
      return NextResponse.json({ error: "stations.error_cannot_remove_another_member_s_station" }, { status: 403 });
    }
    const missions = await readMissions();
    if (missions.some((mission) => mission.systemAddress.toUpperCase() === portal && mission.galaxy === galaxy)) {
      return NextResponse.json({ error: "stations.error_station_associated_with_mission_cannot_be_removed" }, { status: 409 });
    }
    const ownedStations = await readStationPortals(ownerMember.publicId);
    if (!ownedStations.some((station) => station.portal === portal && station.galaxy === galaxy)) {
      return NextResponse.json({ error: "stations.error_station_not_found_in_owner_archive" }, { status: 404 });
    }
    await removeStationPortal(ownerMember.publicId, portal, galaxy);
    return NextResponse.json({ stations: await readStations(member) });
  } catch (error) {
    console.error("Unable to remove station portal", error);
    return NextResponse.json({ error: "stations.error_unable_to_remove_station" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "stations.error_access_required" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const currentPortal = typeof payload.currentPortal === "string" ? payload.currentPortal.toUpperCase() : "";
  const currentGalaxy = payload.currentGalaxy;
  const currentOwnerId = typeof payload.currentOwnerId === "string" ? payload.currentOwnerId.trim() : "";
  const portal = typeof payload.portal === "string" ? payload.portal.toUpperCase() : "";
  const galaxy = payload.galaxy;
  const ownerId = typeof payload.ownerId === "string" ? payload.ownerId.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (
    !decodePortalAddress(currentPortal) ||
    decodePortalAddress(currentPortal)?.errors.length !== 0 ||
    typeof currentGalaxy !== "number" || !Number.isInteger(currentGalaxy) || currentGalaxy < 0 || currentGalaxy > 255 ||
    !currentOwnerId ||
    !decodePortalAddress(portal) ||
    decodePortalAddress(portal)?.errors.length !== 0 ||
    typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255 ||
    !ownerId ||
    name.length > 80 ||
    note.length > 1000 ||
    Object.keys(payload).some((key) => !["currentPortal", "currentGalaxy", "currentOwnerId", "portal", "galaxy", "ownerId", "name", "note"].includes(key))
  ) {
    return NextResponse.json({ error: "stations.error_invalid_station_data" }, { status: 400 });
  }
  const isModerator = hasRole(member, "moderator");

  try {
    const access = await readAccessData();
    const currentOwner = access.members.find((candidate) =>
      candidate.publicId === currentOwnerId && candidate.membershipStatus === "approved",
    );
    const owner = access.members.find((candidate) =>
      candidate.publicId === ownerId && candidate.membershipStatus === "approved",
    );
    if (!currentOwner || !owner) {
      return NextResponse.json({ error: "stations.error_invalid_station_owner" }, { status: 400 });
    }
    if (!isModerator && (currentOwner.publicId !== member.publicId || owner.publicId !== member.publicId)) {
      return NextResponse.json({ error: "stations.error_cannot_edit_another_member_s_station" }, { status: 403 });
    }
    const [missions, currentStations, destinationStations] = await Promise.all([
      readMissions(),
      readStationPortals(currentOwner.publicId),
      readStationPortals(owner.publicId),
    ]);
    const currentStation = currentStations.find((station) =>
      station.portal === currentPortal && station.galaxy === currentGalaxy,
    );
    if (!currentStation) {
      return NextResponse.json({ error: "stations.error_station_not_found_in_owner_archive" }, { status: 404 });
    }
    const creatorMemberId = currentStation.createdByMemberId ?? currentOwner.publicId;
    if (!isModerator && creatorMemberId !== member.publicId) {
      return NextResponse.json({ error: "stations.error_cannot_edit_another_member_s_station" }, { status: 403 });
    }
    const hasAssociatedMission = missions.some((mission) =>
      mission.systemAddress.toUpperCase() === currentPortal && mission.galaxy === currentGalaxy,
    );
    if (
      hasAssociatedMission &&
      (portal !== currentPortal || galaxy !== currentGalaxy || (!isModerator && owner.publicId !== currentOwner.publicId))
    ) {
      return NextResponse.json({ error: "stations.error_station_associated_with_mission_title_only" }, { status: 409 });
    }
    if (destinationStations.some((station) =>
      station.portal === portal &&
      station.galaxy === galaxy &&
      !(owner.publicId === currentOwner.publicId && portal === currentPortal && galaxy === currentGalaxy),
    )) {
      return NextResponse.json({ error: "stations.this_portal_is_already_in_the_selected_owner_s_list" }, { status: 409 });
    }

    const updated = await updateStationPortal(currentOwner.publicId, currentPortal, currentGalaxy, owner.publicId, portal, galaxy, name, note);
    if (!updated) {
      return NextResponse.json({ error: "stations.error_station_missing_or_portal_already_saved" }, { status: 409 });
    }
    if (currentOwner.publicId !== owner.publicId) {
      await writeMissions(missions.map((mission) =>
        mission.stationOwnerMemberId === currentOwner.publicId &&
        mission.systemAddress.toUpperCase() === currentPortal &&
        mission.galaxy === currentGalaxy
          ? { ...mission, stationOwnerMemberId: owner.publicId }
          : mission,
      ));
    }
    await cacheStationPlanet(portal, galaxy);
    return NextResponse.json({ stations: await readStations(member) });
  } catch (error) {
    console.error("Unable to update station portal", error);
    return NextResponse.json({ error: "stations.error_unable_to_update_station" }, { status: 503 });
  }
}

async function readStations(member: AllianceMember) {
  const stations = hasRole(member, "moderator")
    ? await readAllStationPortals()
    : (await readStationPortals(member.publicId)).map((station) => ({ ...station, ownerId: member.publicId }));
  const [almanacByPortal, missions, accessData] = await Promise.all([
    readAlmanacResponses(stations.map((station) => station.portal)),
    readMissions(),
    readAccessData(),
  ]);
  return stations.map((station) => {
    const owner = accessData.members.find((candidate) =>
      candidate.publicId === station.ownerId && candidate.membershipStatus === "approved",
    );
    const matchingMissions = missions.filter((mission) =>
      mission.systemAddress.toUpperCase() === station.portal && mission.galaxy === station.galaxy,
    );
    const completedSpecialties = new Set<MissionSpecialty>();
    for (const mission of matchingMissions) {
      if (mission.targetSpecialty === "all") {
        completedSpecialties.add("builder");
        completedSpecialties.add("ranger");
        completedSpecialties.add("explorer");
      } else {
        completedSpecialties.add(mission.targetSpecialty);
      }
    }
    const availableSpecialties = completedSpecialties.size === 0
      ? [...missionSpecialties]
      : missionSpecialties.filter((specialty) => specialty !== "all" && !completedSpecialties.has(specialty));

    return {
      ...station,
      ownerId: owner?.publicId,
      ownerName: [owner?.nmsName, owner?.name].find((value) => value && !isEmailAddress(value)) || "Former member",
      ownerNmsName: owner?.nmsName ?? "",
      ...(owner?.publicId ? { ownerMemberId: owner.publicId } : {}),
      ...(owner?.image ? { ownerImage: owner.image } : {}),
      planet: almanacByPortal[station.portal]?.find((entry) => entry.galaxy === station.galaxy)?.response ?? null,
      hasMissions: matchingMissions.length > 0,
      missionStatus: matchingMissions.length === 0
        ? "none"
        : matchingMissions.every((mission) => mission.status === "completed")
          ? "completed"
          : "in_progress",
      availableSpecialties,
    };
  });
}

async function cacheStationPlanet(portal: string, galaxy: number) {
  try {
    if (await readAlmanacResponse(portal, galaxy)) return;

    const response = await fetch(`https://nmsalmanac.com/api/planets/${portal}?galaxy=${galaxy + 1}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) return;

    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("portal" in result) || typeof result.portal !== "string" || result.portal.toUpperCase() !== portal) return;
    await writeAlmanacResponse(portal, galaxy, result);
  } catch (error) {
    console.error("Unable to cache station planet from NMS Almanac", error);
  }
}