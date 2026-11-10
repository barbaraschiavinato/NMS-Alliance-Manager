import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readFarms } from "@/lib/farms/farms-store";
import { readPrivateMessages } from "@/lib/messages/private-messages-store";
import { readPets } from "@/lib/pets/pets-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All sidebar counters in one request, so the sidebar sends one request instead of five on every page.
// A counter whose document cannot be read is null: the sidebar keeps its previous value. Farms and pets are only
// counted for moderators and admins (effective role, so simple view hides them), like ?count=1 on their own routes.
async function countOrNull(count: () => Promise<number>): Promise<number | null> {
  try {
    return await count();
  } catch (error) {
    console.error("Unable to compute a sidebar counter", error);
    return null;
  }
}

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();

  const isStaff = hasRole(member, "moderator");
  const openRequests = (kind: "help" | "taxi") => async () =>
    (await readPrivateMessages()).filter(
      (message) => message.subjectType === kind && !message.replyToId && !message.archived,
    ).length;
  const [unread, help, taxi, farms, pets] = await Promise.all([
    countOrNull(
      async () =>
        (await readPrivateMessages()).filter(
          (message) => message.unread && message.recipientMemberId === member.publicId,
        ).length,
    ),
    countOrNull(openRequests("help")),
    countOrNull(openRequests("taxi")),
    isStaff ? countOrNull(async () => (await readFarms()).length) : null,
    isStaff ? countOrNull(async () => (await readPets()).length) : null,
  ]);
  return NextResponse.json(
    { unread, help, taxi, ...(isStaff ? { farms, pets } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
