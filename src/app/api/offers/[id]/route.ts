import type { PublicOffer } from "@/lib/types";
import { requireMerchant } from "@/server/auth";
import { withdrawOffer } from "@/server/domain/offers";
import { notFound, route } from "@/server/http";
import { C, getStore } from "@/server/store";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const o = await getStore().get<PublicOffer & { id: string }>(C.publicOffers, id);
  if (!o) throw notFound("This offer is no longer available");
  return o;
});

/** Merchant withdraws an offer (unreserved packs return to stock). */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { merchant } = await requireMerchant();
  const { id } = await params;
  await withdrawOffer(id, merchant);
  return { ok: true };
});
