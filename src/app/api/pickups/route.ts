import { z } from "zod";
import { requireMerchant } from "@/server/auth";
import { verifyPickup } from "@/server/domain/reservations";
import { parseJson, route } from "@/server/http";

const body = z.object({ code: z.string().max(12).optional(), qr: z.string().max(100).optional() });

export const POST = route(async (req) => {
  const { merchant, user } = await requireMerchant();
  return verifyPickup(merchant, user, await parseJson(req, body));
});
