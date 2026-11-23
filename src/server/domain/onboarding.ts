import { z } from "zod";
import { CATEGORIES, type Merchant, type Ngo, type User } from "@/lib/types";
import { newId } from "../codes";
import { conflict } from "../http";
import { geohash } from "../geo";
import { C, getStore } from "../store";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const merchantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["cafe", "restaurant", "bakery", "cloud_kitchen", "retail"]),
  address: z.string().trim().min(5).max(200),
  location: point,
  pickupHours: z.object({ open: hhmm, close: hhmm }),
});

export const DEFAULT_FOOD_SAFETY: Merchant["foodSafety"] = {
  allowedSaleCategories: [...CATEGORIES],
  donationEligibleCategories: ["bakery", "meals", "fresh"],
  maxHoursSincePrep: { bakery: 24, meals: 6, fresh: 8, desserts: 12, beverages: 6 },
};

export const foodSafetySchema = z.object({
  allowedSaleCategories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  donationEligibleCategories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  maxHoursSincePrep: z.partialRecord(z.enum(CATEGORIES), z.number().min(1).max(72)),
});

/** A customer account creates a business; it starts unverified (licence needed). */
export async function createMerchant(user: User, input: z.infer<typeof merchantSchema>, now = Date.now()): Promise<Merchant> {
  if (user.orgId) throw conflict("already_linked", "This account is already linked to an organisation");
  const m: Merchant = {
    id: newId("mer"), ...input, geohash: geohash(input.location),
    verification: { status: "pending" }, foodSafety: DEFAULT_FOOD_SAFETY,
    aiQuota: { date: "", drafts: 0, voice: 0, licence: 0 }, createdAt: now,
  };
  await getStore().transaction(async (tx) => {
    const me = await tx.get<User & { id: string }>(C.users, user.id);
    if (!me || me.orgId) throw conflict("already_linked");
    tx.set(C.merchants, m as Merchant & { id: string });
    tx.update(C.users, user.id, { role: "merchant_staff", orgId: m.id });
  });
  return m;
}

export const ngoSchema = z.object({
  name: z.string().trim().min(2).max(80),
  serviceArea: point.extend({ radiusKm: z.number().min(1).max(30) }),
});

export async function createNgo(user: User, input: z.infer<typeof ngoSchema>, now = Date.now()): Promise<Ngo> {
  if (user.orgId) throw conflict("already_linked", "This account is already linked to an organisation");
  const n: Ngo = { id: newId("ngo"), ...input, verification: { status: "pending" }, createdAt: now };
  await getStore().transaction(async (tx) => {
    const me = await tx.get<User & { id: string }>(C.users, user.id);
    if (!me || me.orgId) throw conflict("already_linked");
    tx.set(C.ngos, n as Ngo & { id: string });
    tx.update(C.users, user.id, { role: "ngo_member", orgId: n.id });
  });
  return n;
}
