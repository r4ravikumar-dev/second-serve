import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Locale, Role, User } from "@/lib/types";
import { config } from "./config";
import { forbidden, unauthorized } from "./http";
import { C, getStore } from "./store";

export const SESSION_COOKIE = "ss_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const DEV_SECRET = "dev-only-session-secret-not-for-production-use";

function secret(): string {
  if (config.sessionSecret) return config.sessionSecret;
  if (config.isProd) throw new Error("SESSION_SECRET not configured");
  return DEV_SECRET;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(uid: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
    return exp > now && typeof uid === "string" ? uid : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProd,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const uid = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return getStore().get<User & { id: string }>(C.users, uid);
}

export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (roles && !roles.includes(user.role)) throw forbidden(`Requires role: ${roles.join(" or ")}`);
  return user;
}

/** Merchant staff whose merchant is verified (or any merchant staff when allowUnverified). */
export async function requireMerchant(opts: { allowUnverified?: boolean } = {}) {
  const user = await requireUser(["merchant_staff"]);
  if (!user.orgId) throw forbidden("No merchant linked to this account");
  const merchant = await getStore().get<import("@/lib/types").Merchant & { id: string }>(C.merchants, user.orgId);
  if (!merchant) throw forbidden("Merchant not found");
  if (!opts.allowUnverified && merchant.verification.status !== "verified") {
    throw forbidden("Your business licence must be verified first");
  }
  return { user, merchant };
}

export async function requireNgo(opts: { allowUnverified?: boolean } = {}) {
  const user = await requireUser(["ngo_member"]);
  if (!user.orgId) throw forbidden("No NGO linked to this account");
  const ngo = await getStore().get<import("@/lib/types").Ngo & { id: string }>(C.ngos, user.orgId);
  if (!ngo) throw forbidden("NGO not found");
  if (!opts.allowUnverified && ngo.verification.status !== "verified") {
    throw forbidden("Your NGO registration must be verified first");
  }
  return { user, ngo };
}

export async function currentLocale(): Promise<Locale> {
  const jar = await cookies();
  return jar.get("ss_locale")?.value === "hi" ? "hi" : "en";
}
