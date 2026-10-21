import { renderRequestBoard } from "@/components/pages/request-board-route";

export const dynamic = "force-dynamic";

export default async function HelpRequestsRoute() {
  return renderRequestBoard();
}
