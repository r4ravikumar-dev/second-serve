import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { writeLocal } from "@/server/blob";
import { config } from "@/server/config";
import { bad, forbidden, route } from "@/server/http";

/** Local-dev stand-in for a GCS signed URL. Disabled unless BLOB_MODE=local. */
export const PUT = route(async (req: NextRequest) => {
  if (config.blobMode !== "local" || config.isProd) throw forbidden();
  const user = await requireUser(["merchant_staff", "ngo_member"]);
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const [, owner] = path.split("/");
  if (!user.orgId || owner !== user.orgId) throw forbidden("Not your upload");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > config.limits.docMaxBytes) throw bad("too_large");
  await writeLocal(path, buf);
  return { ok: true };
});
