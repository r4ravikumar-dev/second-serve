import type { NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { config } from "@/server/config";
import { sweep } from "@/server/domain/sweep";
import { forbidden, unauthorized, route } from "@/server/http";

const oidc = new OAuth2Client();

/** Called by Cloud Scheduler with an OIDC token for the scheduler service account. */
export const POST = route(async (req: NextRequest) => {
  if (config.isProd || config.authMode === "firebase") {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) throw unauthorized();
    const ticket = await oidc.verifyIdToken({ idToken: token, audience: config.publicUrl }).catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.email_verified || payload.email !== config.schedulerSa) throw forbidden("Unknown caller");
  }
  return sweep();
});
