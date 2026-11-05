import { renderPetsRoute } from "@/components/pages/pets-route";

export const dynamic = "force-dynamic";

export default async function PetDetailRoute({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}>) {
  const { id } = await params;
  return renderPetsRoute({ detailId: id, searchParams });
}
