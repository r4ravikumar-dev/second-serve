import type { Donation, Merchant, PublicOffer } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireUser(["admin"]);
  const store = getStore();
  const [merchants, offers, donations] = await Promise.all([
    store.query<Merchant & { id: string }>(C.merchants, { limit: 300 }),
    store.query<PublicOffer & { id: string }>(C.publicOffers, { limit: 300 }),
    store.query<Donation & { id: string }>(C.donations, { where: [{ field: "status", op: "in", value: ["offered", "claimed"] }], limit: 300 }),
  ]);
  return {
    merchants: merchants.map((m) => ({ id: m.id, name: m.name, location: m.location, status: m.verification.status })),
    offers,
    donations: donations.map((d) => ({ id: d.id, merchantName: d.merchantName, location: d.location, status: d.status, estimatedMeals: d.estimatedMeals })),
  };
});
