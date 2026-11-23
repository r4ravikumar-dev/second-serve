import type { User } from "@/lib/types";
import { config } from "@/server/config";
import { forbidden, route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  if (config.authMode !== "dev" || config.isProd) throw forbidden();
  const users = await getStore().query<User & { id: string }>(C.users, { limit: 50 });
  return users.filter((u) => u.id.startsWith("demo_")).map((u) => ({ id: u.id, displayName: u.displayName, role: u.role }));
});
