import { z } from "zod";
import { requireMerchant } from "@/server/auth";
import { adjustStock } from "@/server/domain/stock";
import { bad, parseJson, route } from "@/server/http";

const body = z.object({
  setPrepared: z.number().int().min(0).max(10000).optional(),
  setRemaining: z.number().int().min(0).max(10000).optional(),
  delta: z.number().int().min(-1000).max(1000).optional(),
});

export const POST = route<{ params: Promise<{ itemId: string }> }>(async (req, { params }) => {
  const { merchant, user } = await requireMerchant();
  const { itemId } = await params;
  const change = await parseJson(req, body);
  if (change.setPrepared === undefined && change.setRemaining === undefined && change.delta === undefined) throw bad("no_change");
  return adjustStock(merchant.id, itemId, change, change.delta !== undefined ? "tap" : "set", user.id);
});
