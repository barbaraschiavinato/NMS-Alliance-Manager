import { renderRequestBoard } from "@/components/pages/request-board-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HelpRequestDetailRoute({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return renderRequestBoard("help", id);
}
