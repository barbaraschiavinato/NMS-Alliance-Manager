import { renderFarmsRoute } from "@/components/pages/farms-route";

export const dynamic = "force-dynamic";

export default async function FarmDetailRoute({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}>) {
  const { id } = await params;
  return renderFarmsRoute({ detailId: id, searchParams });
}
