import { z } from "zod";
import { requireUser } from "@/server/auth";
import { submitVerification } from "@/server/domain/verification";
import { parseJson, route } from "@/server/http";

const body = z.object({
  docPath: z.string().min(5).max(200),
  typedNumber: z.string().trim().min(4).max(40),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

export const POST = route(async (req) => {
  const user = await requireUser(["merchant_staff", "ngo_member"]);
  const input = await parseJson(req, body);
  return submitVerification(user, user.role === "ngo_member" ? "ngo" : "merchant", input);
});
