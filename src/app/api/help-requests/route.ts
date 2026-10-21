import { createBroadcastRequestHandlers } from "@/lib/broadcast-request-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, DELETE } = createBroadcastRequestHandlers("help");
