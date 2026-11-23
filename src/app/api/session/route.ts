import { NextResponse } from "next/server";
import { z } from "zod";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/server/auth";
import { config } from "@/server/config";
import { bad, forbidden, parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

const body = z.union([
  z.object({ devUserId: z.string().min(1).max(64) }),
  z.object({ idToken: z.string().min(20).max(5000) }),
]);

export const POST = route(async (req) => {
  const input = await parseJson(req, body);
  const store = getStore();
  let user: (User & { id: string }) | null = null;

  if ("devUserId" in input) {
    // Demo sign-in: local development only, refused in production by config checks too.
    if (config.authMode !== "dev" || config.isProd) throw forbidden("Dev sign-in is disabled");
    user = await store.get<User & { id: string }>(C.users, input.devUserId);
    if (!user) throw bad("unknown_user");
  } else {
    if (config.authMode !== "firebase") throw forbidden("Firebase sign-in is disabled");
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: config.project });
    const decoded = await getAuth(app).verifyIdToken(input.idToken).catch(() => null);
    if (!decoded) throw bad("invalid_token", "Sign-in expired, please try again");
    user = await store.get<User & { id: string }>(C.users, decoded.uid);
    if (!user) {
      // New accounts are customers; becoming a merchant/NGO requires onboarding + verification.
      // Bootstrap: emails listed in ADMIN_EMAILS (Cloud Run env) become admins on first sign-in.
      const admins = (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean);
      const isAdmin = !!decoded.email && decoded.email_verified === true && admins.includes(decoded.email.toLowerCase());
      user = {
        id: decoded.uid, role: isAdmin ? "admin" : "customer", displayName: (decoded.name as string | undefined)?.slice(0, 60) ?? "Guest",
        email: decoded.email ?? "", locale: "en", activeReservations: 0, noShows: 0, createdAt: Date.now(),
      };
      await store.set(C.users, user);
    }
  }

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
  return res;
});

export const DELETE = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
});
