import type { Merchant, Ngo } from "@/lib/types";
import { getCurrentUser } from "@/server/auth";
import { route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return { user: null };
  let org: Merchant | Ngo | null = null;
  if (user.orgId) org = await getStore().get<(Merchant | Ngo) & { id: string }>(user.role === "ngo_member" ? C.ngos : C.merchants, user.orgId);
  return { user, org };
});
