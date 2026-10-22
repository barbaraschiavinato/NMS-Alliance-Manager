import { renderMessagesRoute } from "@/components/pages/messages-route";

export const dynamic = "force-dynamic";

export default async function MessageDetailRoute({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return renderMessagesRoute(id);
}
