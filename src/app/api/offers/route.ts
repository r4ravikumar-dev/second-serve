import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Offer } from "@/lib/types";
import { requireMerchant } from "@/server/auth";
import { nearbyPublicOffers } from "@/server/domain/offers";
import { route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(25).default(5),
});

/** Public nearby offers (polling fallback for the live map) or ?mine=1 for merchants. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("mine") === "1") {
    const { merchant } = await requireMerchant();
    const rows = await getStore().query<Offer & { id: string }>(C.offers, { where: [{ field: "merchantId", op: "==", value: merchant.id }], limit: 100 });
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }
  const { lat, lng, radiusKm } = q.parse(Object.fromEntries(sp));
  return nearbyPublicOffers({ lat, lng }, radiusKm);
});
