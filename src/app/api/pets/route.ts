import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData, type AllianceMember } from "@/lib/members/access-store";
import { isEmailAddress } from "@/lib/members/member-types";
import { parsePetInput, petImageMaxBytes, petImageTypes, type Pet } from "@/lib/pets/pets";
import { addPet, readPets, removePet, updatePet } from "@/lib/pets/pets-store";
import { deleteImage, storeImage } from "@/lib/storage/image-storage";
import { isSameSystem, stationDetailHref, type SystemIdentity } from "@/lib/navigation/detail-links";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";

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
  return (petImageTypes as readonly string[]).includes(file.type) && file.size <= petImageMaxBytes;
}

function canManagePet(member: AllianceMember, pet: Pet) {
  return hasRole(member, "moderator") || (pet.ownerId !== null && pet.ownerId === member.publicId);
}

function resolveOwner(
  member: AllianceMember,
  members: readonly AllianceMember[],
  requested: unknown,
  fallbackOwnerId: Pet["ownerId"],
): { ownerId: Pet["ownerId"] } | { error: string; status: number } {
  // Null clears the discoverer; omitted or empty values retain the existing default.
  const requestedId =
    requested === null ? null : typeof requested === "string" && requested.trim() ? requested.trim() : fallbackOwnerId;
  if (!hasRole(member, "moderator")) {
    return requestedId === member.publicId
      ? { ownerId: member.publicId }
      : { error: "pets.error_cannot_assign_another_discoverer", status: 403 };
  }
  if (requestedId === null || requestedId === fallbackOwnerId) return { ownerId: requestedId };
  const owner = members.find(
    (candidate) => candidate.publicId === requestedId && candidate.membershipStatus === "approved",
  );
  return owner ? { ownerId: owner.publicId } : { error: "pets.error_discoverer_must_be_approved", status: 400 };
}

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
    const owner = access.members.find(
      (candidate) => candidate.publicId === pet.ownerId && candidate.membershipStatus === "approved",
    );
    const station = stations.find((entry) => isSameSystem(entry, pet));
    return {
      ...pet,
      ...(station ? { stationHref: stationDetailHref(station, "pets") } : {}),
      ...(imagePath ? { imageUrl: `/api/pets/image?path=${encodeURIComponent(imagePath)}` } : {}),
      ownerName: [owner?.nmsName, owner?.name].find((value) => value && !isEmailAddress(value)) || "",
      ...(owner ? { ownerMemberId: owner.publicId } : {}),
      canMessageOwner: Boolean(pet.eggTradeAvailable && owner && !owner.offline && owner.publicId !== member.publicId),
      canManage: canManagePet(member, pet),
    };
  });
}

export async function GET(request?: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "pets.error_access_required" }, { status: 401 });
  const system = parseSystemScope(request ? new URL(request.url).searchParams : new URLSearchParams());
  if (system === null) return NextResponse.json({ error: "farms.error_invalid_portal_and_galaxy" }, { status: 400 });
  const detailId = request ? new URL(request.url).searchParams.get("detailPet") : null;
  try {
    const pets = await petViews(member, {
      detailId: detailId ?? undefined,
      system,
      samePlanet: new URL(request?.url ?? "http://localhost").searchParams.get("samePlanet") === "1",
    });
    if (detailId !== null && pets.length === 0)
      return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
    return NextResponse.json({ pets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read pets", error);
    return NextResponse.json({ error: "pets.error_unable_to_read" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "pets.error_access_required" }, { status: 401 });
  const { payload, image } = await readSubmission(request);
  const parsed = parsePetInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (image && !isValidImage(image)) return NextResponse.json({ error: "pets.error_image_invalid" }, { status: 400 });
  let imagePath: string | undefined;
  try {
    const access = await readAccessData();
    const owner = resolveOwner(member, access.members, payload.ownerId, member.publicId);
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
    return NextResponse.json({ error: "pets.error_unable_to_save" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "pets.error_access_required" }, { status: 401 });
  const { payload, image } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
  const parsed = parsePetInput(payload);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (image && !isValidImage(image)) return NextResponse.json({ error: "pets.error_image_invalid" }, { status: 400 });
  let newImagePath: string | undefined;
  try {
    const [pets, access] = await Promise.all([readPets(), readAccessData()]);
    const current = pets.find((pet) => pet.id === id);
    if (!current) return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
    if (!canManagePet(member, current))
      return NextResponse.json({ error: "pets.error_cannot_edit_another_member_s_pet" }, { status: 403 });
    const owner = resolveOwner(member, access.members, payload.ownerId, current.ownerId);
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
      return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
    }
    if (pet.imagePath !== current.imagePath) await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ pet, pets: await petViews(member) });
  } catch (error) {
    console.error("Unable to update pet", error);
    await deleteImageQuietly(newImagePath);
    return NextResponse.json({ error: "pets.error_unable_to_save" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "pets.error_access_required" }, { status: 401 });
  const { payload } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  try {
    const current = (await readPets()).find((pet) => pet.id === id);
    if (!current) return NextResponse.json({ error: "pets.error_not_found" }, { status: 404 });
    if (!canManagePet(member, current))
      return NextResponse.json({ error: "pets.error_cannot_remove_another_member_s_pet" }, { status: 403 });
    await removePet(id);
    await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ pets: await petViews(member) });
  } catch (error) {
    console.error("Unable to remove pet", error);
    return NextResponse.json({ error: "pets.error_unable_to_remove" }, { status: 503 });
  }
}
