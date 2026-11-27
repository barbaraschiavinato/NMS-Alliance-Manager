import { renderEventsRoute } from "@/components/pages/events-route";

export const dynamic = "force-dynamic";

export default async function EventsRoute() {
  return renderEventsRoute();
}
