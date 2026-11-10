import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData, type AllianceMember } from "@/lib/members/access-store";
import { canManageOwnedItem, findApprovedOwner, ownerDisplayName, resolveOwner } from "@/lib/members/owned-items";
import { readAlmanacResponses } from "@/lib/almanac/almanac-store";
import { parseFarmInput } from "@/lib/farms/farms";
import { addFarm, readFarms, removeFarm, updateFarm } from "@/lib/farms/farms-store";
import { isSameSystem, stationDetailHref, type SystemIdentity } from "@/lib/navigation/detail-links";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { almanacImageUrl } from "@/lib/almanac/almanac-config";
import { apiError, badRequest, forbidden, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

async function readPayload(request: Request): Promise<Payload> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Payload) : {};
}

const farmOwnerErrors = {
  cannotAssignAnother: "farms.error_cannot_assign_another_owner",
  mustBeApproved: "farms.error_owner_must_be_approved",
} as const;

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
    const owner = findApprovedOwner(access.members, farm.ownerId);
    const station = stations.find((entry) => isSameSystem(entry, farm));
    const response = almanac[farm.portal]?.find((entry) => entry.galaxy === farm.galaxy)?.response;
    const pictures = response?.pictures;
    const planetImageUrl = almanacImageUrl(
      pictures && typeof pictures === "object" ? (pictures as Record<string, unknown>).disc : undefined,
    );
    return {
      ...farm,
      ownerName: ownerDisplayName(owner),
      ...(owner ? { ownerMemberId: owner.publicId } : {}),
      ...(owner?.image ? { ownerImage: owner.image } : {}),
      ...(station ? { stationHref: stationDetailHref(station, "farms") } : {}),
      ...(planetImageUrl ? { planetImageUrl } : {}),
      canManage: canManageOwnedItem(member, farm),
    };
  });
}

export const GET = withRequestMemo(async function GET(request?: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("farms.error_access_required", 401);
  try {
    const params = request ? new URL(request.url).searchParams : new URLSearchParams();
    if (params.get("count") === "1") {
      if (!hasRole(member, "moderator")) return forbidden("farms.error_access_required");
      return NextResponse.json({ count: (await readFarms()).length }, { headers: { "Cache-Control": "no-store" } });
    }
    const detailId = params.get("detailFarm");
    const system = parseSystemScope(params);
    if (system === null) return badRequest("farms.error_invalid_portal_and_galaxy");
    const farms = await farmViews(member, {
      detailId: detailId ?? undefined,
      system,
      samePlanet: params.get("samePlanet") === "1",
    });
    if (detailId !== null && farms.length === 0) return notFound("farms.error_not_found");
    return NextResponse.json({ farms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read farms", error);
    return apiError("farms.error_unable_to_read", 503);
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("farms.error_access_required", 401);
  const payload = await readPayload(request);
  const parsed = parseFarmInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const access = await readAccessData();
    const owner = resolveOwner(member, access.members, payload.ownerId, member.publicId, farmOwnerErrors);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    const farm = await addFarm(parsed.input, owner.ownerId, member.publicId);
    return NextResponse.json({ farm, farms: await farmViews(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save farm", error);
    return apiError("farms.error_unable_to_save", 503);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("farms.error_access_required", 401);
  const payload = await readPayload(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return notFound("farms.error_not_found");
  const parsed = parseFarmInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const [farms, access] = await Promise.all([readFarms(), readAccessData()]);
    const current = farms.find((farm) => farm.id === id);
    if (!current) return notFound("farms.error_not_found");
    if (!canManageOwnedItem(member, current)) return forbidden("farms.error_cannot_edit_another_member_s_farm");
    const owner = resolveOwner(member, access.members, payload.ownerId, current.ownerId, farmOwnerErrors);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    const input =
      !("systemName" in payload) && current.systemName && isSameSystem(parsed.input, current)
        ? { ...parsed.input, systemName: current.systemName }
        : parsed.input;
    const farm = await updateFarm(id, input, owner.ownerId);
    if (!farm) return notFound("farms.error_not_found");
    return NextResponse.json({ farm, farms: await farmViews(member) });
  } catch (error) {
    console.error("Unable to update farm", error);
    return apiError("farms.error_unable_to_save", 503);
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("farms.error_access_required", 401);
  const payload = await readPayload(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  try {
    const current = (await readFarms()).find((farm) => farm.id === id);
    if (!current) return notFound("farms.error_not_found");
    if (!canManageOwnedItem(member, current)) return forbidden("farms.error_cannot_remove_another_member_s_farm");
    await removeFarm(id);
    return NextResponse.json({ farms: await farmViews(member) });
  } catch (error) {
    console.error("Unable to remove farm", error);
    return apiError("farms.error_unable_to_remove", 503);
  }
});
