import type { Merchant, Ngo } from "@/lib/types";
import { pageUser } from "./guards";
import { C, getStore } from "./store";

export async function merchantContext() {
  const user = await pageUser(["merchant_staff"]);
  const merchant = user.orgId ? await getStore().get<Merchant & { id: string }>(C.merchants, user.orgId) : null;
  return { user, merchant, verified: merchant?.verification.status === "verified" };
}

export async function ngoContext() {
  const user = await pageUser(["ngo_member"]);
  const ngo = user.orgId ? await getStore().get<Ngo & { id: string }>(C.ngos, user.orgId) : null;
  return { user, ngo, verified: ngo?.verification.status === "verified" };
}
