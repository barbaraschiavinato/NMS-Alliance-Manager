import { renderRequestBoard } from "@/components/pages/request-board-route";

export const dynamic = "force-dynamic";

export default async function TaxiRoute() {
  return renderRequestBoard("taxi");
}
