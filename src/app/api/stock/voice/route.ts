import { z } from "zod";
import { parseStockUpdate } from "@/server/ai";
import { requireMerchant } from "@/server/auth";
import { readObject } from "@/server/blob";
import { config } from "@/server/config";
import { consumeQuota } from "@/server/domain/quota";
import { listStock } from "@/server/domain/stock";
import { bad, forbidden, parseJson, route } from "@/server/http";

const body = z.object({
  text: z.string().trim().max(500).optional(),
  audioPath: z.string().max(200).optional(),
  mimeType: z.string().max(60).optional(),
});

/** Returns PROPOSED updates only. Staff confirm them in the UI, then /api/stock/apply. */
export const POST = route(async (req) => {
  const { merchant } = await requireMerchant();
  const input = await parseJson(req, body);
  if (!input.text && !input.audioPath) throw bad("empty_input");
  if (input.audioPath && !input.audioPath.startsWith(`audio/${merchant.id}/`)) throw forbidden();
  await consumeQuota(merchant.id, "voice");
  const stock = await listStock(merchant.id);
  const media = input.audioPath ? { bytes: await readObject(input.audioPath, config.limits.audioMaxBytes), mimeType: input.mimeType ?? "audio/webm" } : undefined;
  const { result, model } = await parseStockUpdate({ stock, text: input.text, media });
  const proposals = result.updates.map((u) => {
    const s = stock.find((x) => x.id === u.stockItemId)!;
    const next = u.setRemaining ?? Math.max(0, s.remaining + (u.delta ?? 0));
    return { stockItemId: s.id, name: s.name, current: s.remaining, proposed: next, confidence: u.confidence };
  });
  return { transcript: result.transcript, language: result.inputLanguage, proposals, unmatched: result.unmatched, model };
});
