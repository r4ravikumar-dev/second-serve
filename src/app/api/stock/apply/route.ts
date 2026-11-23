import { z } from "zod";
import { requireMerchant } from "@/server/auth";
import { adjustStock } from "@/server/domain/stock";
import { parseJson, route } from "@/server/http";

const body = z.object({
  updates: z.array(z.object({ stockItemId: z.string().min(1).max(64), setRemaining: z.number().int().min(0).max(10000) })).min(1).max(30),
});

/** Applies staff-confirmed voice proposals. */
export const POST = route(async (req) => {
  const { merchant, user } = await requireMerchant();
  const { updates } = await parseJson(req, body);
  const out = [];
  for (const u of updates) out.push(await adjustStock(merchant.id, u.stockItemId, { setRemaining: u.setRemaining }, "voice", user.id));
  return { items: out };
});
