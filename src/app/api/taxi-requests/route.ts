import { createBroadcastRequestHandlers } from "@/lib/messages/broadcast-request-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, DELETE, PATCH } = createBroadcastRequestHandlers("taxi");
