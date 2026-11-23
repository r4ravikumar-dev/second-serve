import { z } from "zod";
import { requireMerchant, requireUser } from "@/server/auth";
import { foodSafetySchema, createMerchant, merchantSchema } from "@/server/domain/onboarding";
import { parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const POST = route(async (req) => {
  const user = await requireUser(["customer"]);
  const input = await parseJson(req, merchantSchema);
  return createMerchant(user, input);
});

const patch = z.object({
  foodSafety: foodSafetySchema.optional(),
  pickupHours: z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).optional(),
});

export const PATCH = route(async (req) => {
  const { merchant } = await requireMerchant({ allowUnverified: true });
  const input = await parseJson(req, patch);
  await getStore().update(C.merchants, merchant.id, input as Record<string, unknown>);
  return { ok: true };
});
