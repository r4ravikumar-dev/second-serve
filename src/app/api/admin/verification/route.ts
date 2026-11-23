import { z } from "zod";
import { requireUser } from "@/server/auth";
import { decideVerification, verificationQueue } from "@/server/domain/verification";
import { parseJson, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireUser(["admin"]);
  return verificationQueue();
});

const body = z.object({
  kind: z.enum(["merchant", "ngo"]),
  id: z.string().min(1).max(64),
  approve: z.boolean(),
  reason: z.string().max(300).optional(),
});

export const POST = route(async (req) => {
  const admin = await requireUser(["admin"]);
  const { kind, id, approve, reason } = await parseJson(req, body);
  await decideVerification(admin, kind, id, approve, reason);
  return { ok: true };
});
