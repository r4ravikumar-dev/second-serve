import { route } from "@/server/http";
import { config } from "@/server/config";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({
  ok: true,
  modes: { data: config.dataBackend, auth: config.authMode, ai: config.aiMode, blob: config.blobMode },
}));
