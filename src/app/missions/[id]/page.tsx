import { renderStationsRoute } from "@/components/pages/stations-route";

export const dynamic = "force-dynamic";

export default async function MissionDetailRoute({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[]; source?: string | string[] }>;
}>) {
  const { id } = await params;
  return renderStationsRoute({ searchParams, missionDetailId: id });
}
