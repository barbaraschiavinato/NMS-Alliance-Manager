import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData, type AllianceMember } from "@/lib/members/access-store";
import { isEmailAddress } from "@/lib/members/member-types";
import { readAlmanacResponses } from "@/lib/almanac/almanac-store";
import { parseFarmInput, type Farm } from "@/lib/farms/farms";
import { addFarm, readFarms, removeFarm, updateFarm } from "@/lib/farms/farms-store";
import { isSameSystem, stationDetailHref, type SystemIdentity } from "@/lib/navigation/detail-links";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { withRequestMemo } from "@/lib/storage/request-memo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

async function readPayload(request: Request): Promise<Payload> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Payload) : {};
}

function canManageFarm(member: AllianceMember, farm: Farm) {
  return hasRole(member, "moderator") || (farm.ownerId !== null && farm.ownerId === member.publicId);
}

function resolveOwner(
  member: AllianceMember,
  members: readonly AllianceMember[],
  requested: unknown,
  fallbackOwnerId: Farm["ownerId"],
): { ownerId: Farm["ownerId"] } | { error: string; status: number } {
  // Null clears the owner; omitted or empty values retain the existing default.
  const requestedId =
    requested === null ? null : typeof requested === "string" && requested.trim() ? requested.trim() : fallbackOwnerId;
  if (!hasRole(member, "moderator")) {
    return requestedId === member.publicId
      ? { ownerId: member.publicId }
      : { error: "farms.error_cannot_assign_another_owner", status: 403 };
  }
  if (requestedId === null || requestedId === fallbackOwnerId) return { ownerId: requestedId };
  const owner = members.find(
    (candidate) => candidate.publicId === requestedId && candidate.membershipStatus === "approved",
  );
  return owner ? { ownerId: owner.publicId } : { error: "farms.error_owner_must_be_approved", status: 400 };
}

// `samePlanet` widens a detail request to every farm of the same planet (portal and galaxy), newest first.
type FarmScope = Readonly<{ detailId?: string; system?: SystemIdentity; samePlanet?: boolean }>;

function parseSystemScope(params: URLSearchParams): SystemIdentity | null | undefined {
  const portal = params.get("systemPortal");
  const galaxy = params.get("galaxy");
  if (portal === null && galaxy === null) return undefined;
  if (!portal || !/^[0-9a-f]{12}$/i.test(portal) || !galaxy || !/^\d{1,3}$/.test(galaxy) || Number(galaxy) > 255)
    return null;
  return { portal: portal.toUpperCase(), galaxy: Number(galaxy) };
}

async function farmViews(member: AllianceMember, scope: FarmScope = {}) {
  const [storedFarms, access] = await Promise.all([readFarms(), readAccessData()]);
  const { detailId, system, samePlanet } = scope;
  const detailFarm = detailId === undefined ? undefined : storedFarms.find((farm) => farm.id === detailId);
  const farms = storedFarms.filter((farm) => {
    if (detailId !== undefined) {
      if (!detailFarm) return false;
      const sameFarm = samePlanet
        ? farm.portal.toUpperCase() === detailFarm.portal.toUpperCase() && farm.galaxy === detailFarm.galaxy
        : farm.id === detailId;
      if (!sameFarm) return false;
    }
    return !system || isSameSystem(farm, system);
  });
  // Cache-only read: farm cards never trigger new NMS Almanac requests.
  const [almanac, stations] = await Promise.all([
    readAlmanacResponses([...new Set(farms.map((farm) => farm.portal))], true),
    farms.length > 0 ? readVisibleStationPortals(member) : Promise.resolve([]),
  ]);
  return farms.map((farm) => {
    const owner = access.members.find(
      (candidate) => candidate.publicId === farm.ownerId && candidate.membershipStatus === "approved",
    );
    const station = stations.find((entry) => isSameSystem(entry, farm));
    const response = almanac[farm.portal]?.find((entry) => entry.galaxy === farm.galaxy)?.response;
    const pictures = response?.pictures;
    const disc = pictures && typeof pictures === "object" ? (pictures as Record<string, unknown>).disc : undefined;
    return {
      ...farm,
      ownerName: [owner?.nmsName, owner?.name].find((value) => value && !isEmailAddress(value)) || "",
      ...(owner ? { ownerMemberId: owner.publicId } : {}),
      ...(owner?.image ? { ownerImage: owner.image } : {}),
      ...(station ? { stationHref: stationDetailHref(station, "farms") } : {}),
      ...(typeof disc === "string" && disc.startsWith("/planets/")
        ? { planetImageUrl: `https://nmsalmanac.com/api${disc}` }
        : {}),
      canManage: canManageFarm(member, farm),
    };
  });
}

export const GET = withRequestMemo(async function GET(request?: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "farms.error_access_required" }, { status: 401 });
  try {
    const params = request ? new URL(request.url).searchParams : new URLSearchParams();
    if (params.get("count") === "1") {
      if (!hasRole(member, "moderator"))
        return NextResponse.json({ error: "farms.error_access_required" }, { status: 403 });
      return NextResponse.json({ count: (await readFarms()).length }, { headers: { "Cache-Control": "no-store" } });
    }
    const detailId = params.get("detailFarm");
    const system = parseSystemScope(params);
    if (system === null) return NextResponse.json({ error: "farms.error_invalid_portal_and_galaxy" }, { status: 400 });
    const farms = await farmViews(member, {
      detailId: detailId ?? undefined,
      system,
      samePlanet: params.get("samePlanet") === "1",
    });
    if (detailId !== null && farms.length === 0)
      return NextResponse.json({ error: "farms.error_not_found" }, { status: 404 });
    return NextResponse.json({ farms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read farms", error);
    return NextResponse.json({ error: "farms.error_unable_to_read" }, { status: 503 });
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "farms.error_access_required" }, { status: 401 });
  const payload = await readPayload(request);
  const parsed = parseFarmInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const access = await readAccessData();
    const owner = resolveOwner(member, access.members, payload.ownerId, member.publicId);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    const farm = await addFarm(parsed.input, owner.ownerId, member.publicId);
    return NextResponse.json({ farm, farms: await farmViews(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save farm", error);
    return NextResponse.json({ error: "farms.error_unable_to_save" }, { status: 503 });
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "farms.error_access_required" }, { status: 401 });
  const payload = await readPayload(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return NextResponse.json({ error: "farms.error_not_found" }, { status: 404 });
  const parsed = parseFarmInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const [farms, access] = await Promise.all([readFarms(), readAccessData()]);
    const current = farms.find((farm) => farm.id === id);
    if (!current) return NextResponse.json({ error: "farms.error_not_found" }, { status: 404 });
    if (!canManageFarm(member, current))
      return NextResponse.json({ error: "farms.error_cannot_edit_another_member_s_farm" }, { status: 403 });
    const owner = resolveOwner(member, access.members, payload.ownerId, current.ownerId);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    const input =
      !("systemName" in payload) && current.systemName && isSameSystem(parsed.input, current)
        ? { ...parsed.input, systemName: current.systemName }
        : parsed.input;
    const farm = await updateFarm(id, input, owner.ownerId);
    if (!farm) return NextResponse.json({ error: "farms.error_not_found" }, { status: 404 });
    return NextResponse.json({ farm, farms: await farmViews(member) });
  } catch (error) {
    console.error("Unable to update farm", error);
    return NextResponse.json({ error: "farms.error_unable_to_save" }, { status: 503 });
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "farms.error_access_required" }, { status: 401 });
  const payload = await readPayload(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  try {
    const current = (await readFarms()).find((farm) => farm.id === id);
    if (!current) return NextResponse.json({ error: "farms.error_not_found" }, { status: 404 });
    if (!canManageFarm(member, current))
      return NextResponse.json({ error: "farms.error_cannot_remove_another_member_s_farm" }, { status: 403 });
    await removeFarm(id);
    return NextResponse.json({ farms: await farmViews(member) });
  } catch (error) {
    console.error("Unable to remove farm", error);
    return NextResponse.json({ error: "farms.error_unable_to_remove" }, { status: 503 });
  }
});
