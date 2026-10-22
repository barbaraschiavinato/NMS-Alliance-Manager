import { renderRequestBoard } from "@/components/pages/request-board-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TaxiRoute() {
  return renderRequestBoard("taxi");
}
