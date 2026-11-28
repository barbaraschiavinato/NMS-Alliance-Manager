import { renderEventsRoute } from "@/components/pages/events-route";

export const dynamic = "force-dynamic";

export default async function EventDetailRoute({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}>) {
  const { id } = await params;
  return renderEventsRoute({ detailId: id, searchParams });
}
