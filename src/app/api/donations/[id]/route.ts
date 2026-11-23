import { z } from "zod";
import { requireMerchant, requireNgo } from "@/server/auth";
import { claimDonation, confirmHandover } from "@/server/domain/donations";
import { parseJson, route } from "@/server/http";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("handover"), code: z.string().min(4).max(12) }),
]);

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const input = await parseJson(req, body);
  if (input.action === "claim") {
    const { ngo, user } = await requireNgo();
    return claimDonation(ngo, user, id);
  }
  const { merchant, user } = await requireMerchant();
  return confirmHandover(merchant, user, id, input.code);
});
