import { z } from "zod";
import { requireMerchant } from "@/server/auth";
import { readObject } from "@/server/blob";
import { config } from "@/server/config";
import { createDraft } from "@/server/domain/surplus";
import { forbidden, parseJson, route } from "@/server/http";

const body = z.object({
  source: z.enum(["stock", "text", "voice", "photo"]),
  selected: z.array(z.object({ stockItemId: z.string().min(1).max(64), qty: z.number().int().min(1).max(1000) })).max(20).optional(),
  text: z.string().trim().max(1000).optional(),
  mediaPath: z.string().max(200).optional(),
  mimeType: z.string().max(60).optional(),
});

export const POST = route(async (req) => {
  const { merchant, user } = await requireMerchant();
  const input = await parseJson(req, body);
  let media;
  if (input.mediaPath) {
    const isPhoto = input.mediaPath.startsWith(`photo/${merchant.id}/`);
    const isAudio = input.mediaPath.startsWith(`audio/${merchant.id}/`);
    if (!isPhoto && !isAudio) throw forbidden("Not your upload");
    const bytes = await readObject(input.mediaPath, isPhoto ? config.limits.photoMaxBytes : config.limits.audioMaxBytes);
    media = { bytes, mimeType: input.mimeType ?? (isPhoto ? "image/jpeg" : "audio/webm") };
  }
  return createDraft({ merchant, user, source: input.source, selected: input.selected, text: input.text, media });
});
