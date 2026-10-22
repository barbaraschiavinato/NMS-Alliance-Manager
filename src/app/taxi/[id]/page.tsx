import { renderRequestBoard } from "@/components/pages/request-board-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TaxiRequestDetailRoute({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return renderRequestBoard("taxi", id);
}
