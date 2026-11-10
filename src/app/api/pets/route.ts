import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData, type AllianceMember } from "@/lib/members/access-store";
import { canManageOwnedItem, findApprovedOwner, ownerDisplayName, resolveOwner } from "@/lib/members/owned-items";
import { parsePetInput, petImageTypes } from "@/lib/pets/pets";
import { imageUploadMaxBytes } from "@/lib/utils/limits";
import { addPet, readPets, removePet, updatePet } from "@/lib/pets/pets-store";
import { deleteImage, storeImage } from "@/lib/storage/image-storage";
import { isSameSystem, stationDetailHref, type SystemIdentity } from "@/lib/navigation/detail-links";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, badRequest, forbidden, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;
type Submission = Readonly<{ payload: Payload; image: File | null }>;

function asPayload(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}

// Create and update requests are multipart (JSON `payload` plus an optional `image`); deletes are plain JSON.
async function readSubmission(request: Request): Promise<Submission> {
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const rawPayload = form?.get("payload");
    let payload: Payload = {};
    try {
      payload = typeof rawPayload === "string" ? asPayload(JSON.parse(rawPayload)) : {};
    } catch {
      payload = {};
    }
    const image = form?.get("image");
    return { payload, image: image instanceof File && image.size > 0 ? image : null };
  }
  return { payload: asPayload(await request.json().catch(() => null)), image: null };
}

function isValidImage(file: File) {
  return (petImageTypes as readonly string[]).includes(file.type) && file.size <= imageUploadMaxBytes;
}

const petOwnerErrors = {
  cannotAssignAnother: "pets.error_cannot_assign_another_discoverer",
  mustBeApproved: "pets.error_discoverer_must_be_approved",
} as const;

function imagePathFor(file: File) {
  return `alliance-manager/pets/${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
}

async function deleteImageQuietly(pathname: string | undefined) {
  if (!pathname) return;
  try {
    await deleteImage(pathname);
  } catch (error) {
    console.error("Unable to delete pet image", error);
  }
}

function parseSystemScope(params: URLSearchParams): SystemIdentity | null | undefined {
  const portal = params.get("systemPortal");
  const galaxy = params.get("galaxy");
  if (portal === null && galaxy === null) return undefined;
  if (!portal || !/^[0-9a-f]{12}$/i.test(portal) || !galaxy || !/^\d{1,3}$/.test(galaxy) || Number(galaxy) > 255)
    return null;
  return { portal: portal.toUpperCase(), galaxy: Number(galaxy) };
}

// `samePlanet` widens a detail request to every pet of the same planet (portal and galaxy).
type PetScope = Readonly<{ detailId?: string; system?: SystemIdentity; samePlanet?: boolean }>;

async function petViews(member: AllianceMember, scope: PetScope = {}) {
  const [storedPets, access] = await Promise.all([readPets(), readAccessData()]);
  const { detailId, system, samePlanet } = scope;
  const detailPet = detailId === undefined ? undefined : storedPets.find((pet) => pet.id === detailId);
  const pets = storedPets.filter((pet) => {
    if (detailId !== undefined) {
      if (!detailPet) return false;
      const samePet = samePlanet
        ? pet.portal.toUpperCase() === detailPet.portal.toUpperCase() && pet.galaxy === detailPet.galaxy
        : pet.id === detailId;
      if (!samePet) return false;
    }
    return !system || isSameSystem(pet, system);
  });
  const stations = pets.length > 0 ? await readVisibleStationPortals(member) : [];
  return pets.map(({ imagePath, ...pet }) => {
    const owner = findApprovedOwner(access.members, pet.ownerId);
    const station = stations.find((entry) => isSameSystem(entry, pet));
    return {
      ...pet,
      ...(station ? { stationHref: stationDetailHref(station, "pets") } : {}),
      ...(imagePath ? { imageUrl: `/api/pets/image?path=${encodeURIComponent(imagePath)}` } : {}),
      ownerName: ownerDisplayName(owner),
      ...(owner ? { ownerMemberId: owner.publicId } : {}),
      canMessageOwner: Boolean(pet.eggTradeAvailable && owner && !owner.offline && owner.publicId !== member.publicId),
      canManage: canManageOwnedItem(member, pet),
    };
  });
}

export const GET = withRequestMemo(async function GET(request?: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("pets.error_access_required", 401);
  const params = request ? new URL(request.url).searchParams : new URLSearchParams();
  if (params.get("count") === "1") {
    if (!hasRole(member, "moderator")) return forbidden("pets.error_access_required");
    try {
      return NextResponse.json({ count: (await readPets()).length }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Unable to count pets", error);
      return apiError("pets.error_unable_to_read", 503);
    }
  }
  const system = parseSystemScope(params);
  if (system === null) return badRequest("farms.error_invalid_portal_and_galaxy");
  const detailId = params.get("detailPet");
  try {
    const pets = await petViews(member, {
      detailId: detailId ?? undefined,
      system,
      samePlanet: params.get("samePlanet") === "1",
    });
    if (detailId !== null && pets.length === 0) return notFound("pets.error_not_found");
    return NextResponse.json({ pets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read pets", error);
    return apiError("pets.error_unable_to_read", 503);
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("pets.error_access_required", 401);
  const { payload, image } = await readSubmission(request);
  const parsed = parsePetInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (image && !isValidImage(image)) return badRequest("pets.error_image_invalid");
  let imagePath: string | undefined;
  try {
    const access = await readAccessData();
    const owner = resolveOwner(member, access.members, payload.ownerId, member.publicId, petOwnerErrors);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    if (image) {
      imagePath = imagePathFor(image);
      await storeImage(imagePath, image);
    }
    const pet = await addPet(parsed.input, owner.ownerId, member.publicId, imagePath);
    return NextResponse.json({ pet, pets: await petViews(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save pet", error);
    await deleteImageQuietly(imagePath);
    return apiError("pets.error_unable_to_save", 503);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("pets.error_access_required", 401);
  const { payload, image } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return notFound("pets.error_not_found");
  const parsed = parsePetInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (image && !isValidImage(image)) return badRequest("pets.error_image_invalid");
  let newImagePath: string | undefined;
  try {
    const [pets, access] = await Promise.all([readPets(), readAccessData()]);
    const current = pets.find((pet) => pet.id === id);
    if (!current) return notFound("pets.error_not_found");
    if (!canManageOwnedItem(member, current)) return forbidden("pets.error_cannot_edit_another_member_s_pet");
    const owner = resolveOwner(member, access.members, payload.ownerId, current.ownerId, petOwnerErrors);
    if ("error" in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });
    if (image) {
      newImagePath = imagePathFor(image);
      await storeImage(newImagePath, image);
    }
    const pet = await updatePet(
      id,
      parsed.input,
      owner.ownerId,
      newImagePath ?? (payload.removeImage === true ? null : undefined),
    );
    if (!pet) {
      await deleteImageQuietly(newImagePath);
      return notFound("pets.error_not_found");
    }
    if (pet.imagePath !== current.imagePath) await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ pet, pets: await petViews(member) });
  } catch (error) {
    console.error("Unable to update pet", error);
    await deleteImageQuietly(newImagePath);
    return apiError("pets.error_unable_to_save", 503);
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("pets.error_access_required", 401);
  const { payload } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  try {
    const current = (await readPets()).find((pet) => pet.id === id);
    if (!current) return notFound("pets.error_not_found");
    if (!canManageOwnedItem(member, current)) return forbidden("pets.error_cannot_remove_another_member_s_pet");
    await removePet(id);
    await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ pets: await petViews(member) });
  } catch (error) {
    console.error("Unable to remove pet", error);
    return apiError("pets.error_unable_to_remove", 503);
  }
});
