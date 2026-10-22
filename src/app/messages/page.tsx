import { renderMessagesRoute } from "@/components/pages/messages-route";

export const dynamic = "force-dynamic";

export default async function MessagesRoute() {
  return renderMessagesRoute();
}
