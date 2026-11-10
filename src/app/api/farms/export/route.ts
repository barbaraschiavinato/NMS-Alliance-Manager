import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { isFarmPlant } from "@/lib/farms/farms";
import { readFarms } from "@/lib/farms/farms-store";
import { readAccessData } from "@/lib/members/access-store";
import { isEmailAddress } from "@/lib/members/member-types";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { translateAlmanacValue } from "@/lib/translations";
import { buildWorkbook, workbookContentType } from "@/lib/utils/xlsx-workbook";
import { withRequestMemo } from "@/lib/storage/request-memo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredMember = Awaited<ReturnType<typeof readAccessData>>["members"][number];

function memberDisplayName(member: StoredMember | undefined) {
  if (!member) return "Ex membro";
  return [member.nmsName, member.name].find((name) => name?.trim() && !isEmailAddress(name)) ?? "Ex membro";
}

function resourceList(resources: readonly string[]) {
  return resources.map((resource) => translateAlmanacValue("it", resource)).join(", ");
}

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "farms.error_access_required" }, { status: 401 });
  if (!hasRole(member, "moderator")) {
    return NextResponse.json({ error: "farms.error_moderator_permission_required" }, { status: 403 });
  }

  try {
    const [farms, accessData] = await Promise.all([readFarms(), readAccessData()]);
    const membersById = new Map(accessData.members.map((candidate) => [candidate.publicId, candidate]));
    const headers = [
      "Nome farm",
      "Nome sistema",
      "Nome pianeta",
      "Indirizzo portale",
      "Galassia",
      "Materiali",
      "Piante",
      "Coordinate",
      "Note",
      "Proprietario",
      "Nome NMS proprietario",
      "Registrata da",
      "Data registrazione",
      "Ultima modifica",
    ];
    const rows = [...farms]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((farm) => {
        const owner = farm.ownerId === null ? undefined : membersById.get(farm.ownerId);
        const creator = farm.createdByMemberId ? membersById.get(farm.createdByMemberId) : undefined;
        return [
          farm.name,
          farm.systemName ?? "",
          farm.planetName,
          farm.portal,
          galaxyLabel(farm.galaxy),
          resourceList(farm.resources.filter((resource) => !isFarmPlant(resource))),
          resourceList(farm.resources.filter((resource) => isFarmPlant(resource))),
          farm.coordinates ?? "",
          farm.note ?? "",
          farm.ownerId === null ? "Non assegnato" : memberDisplayName(owner),
          owner?.nmsName && !isEmailAddress(owner.nmsName) ? owner.nmsName : "",
          farm.createdByMemberId ? memberDisplayName(creator) : "",
          farm.createdAt,
          farm.updatedAt ?? "",
        ];
      });
    const file = buildWorkbook({
      sheetName: "Farm",
      headers,
      rows,
      widths: [28, 24, 24, 18, 24, 40, 40, 20, 60, 24, 24, 24, 24, 24],
    });
    const filename = `farm-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": workbookContentType,
      },
    });
  } catch (error) {
    console.error("Unable to export farms", error);
    return NextResponse.json({ error: "farms.error_unable_to_export" }, { status: 503 });
  }
});
