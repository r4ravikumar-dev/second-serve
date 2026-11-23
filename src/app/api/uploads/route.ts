import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createUploadTarget, objectPath, validateUpload } from "@/server/blob";
import { newId } from "@/server/codes";
import { forbidden, parseJson, route } from "@/server/http";

const body = z.object({
  kind: z.enum(["photo", "audio", "licence"]),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive(),
});

/** Returns a short-lived upload target. The object path is chosen by the server. */
export const POST = route(async (req) => {
  const user = await requireUser(["merchant_staff", "ngo_member"]);
  if (!user.orgId) throw forbidden("Create your profile first");
  const { kind, contentType, size } = await parseJson(req, body);
  if (user.role === "ngo_member" && kind !== "licence") throw forbidden();
  validateUpload(kind, contentType, size);
  const path = objectPath(user.orgId, kind, newId("up"));
  const target = await createUploadTarget(path, contentType);
  return { path, ...target };
});
