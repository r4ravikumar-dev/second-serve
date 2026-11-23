import { z } from "zod";
import { ALLERGENS, CATEGORIES, type Donation, type Merchant, type Offer, type SalesDay, type StockItem, type SurplusDraft, type User } from "@/lib/types";
import { newId } from "../codes";
import { config } from "../config";
import { bad, conflict, forbidden, notFound } from "../http";
import { C, getStore } from "../store";
import { syncPublic, toPublicOffer } from "./projection";
import { emptySalesDay, rollToToday, salesDayId, takeForRescue } from "./stock";
import { dayKey, hhmmToMinutes, minutesOfDay } from "./time";

export const approveSchema = z.object({
  channel: z.enum(["sell", "donate"]),
  title: z.string().trim().min(2).max(80),
  titleHi: z.string().trim().max(80).optional(),
  category: z.enum(CATEGORIES),
  vegMark: z.enum(["veg", "nonveg", "egg"]),
  packs: z.number().int().min(1).max(200),
  originalPricePerPack: z.number().min(1).max(100_000),
  pricePerPack: z.number().min(0).max(100_000),
  items: z.array(z.object({
    stockItemId: z.string().max(64).optional(),
    name: z.string().trim().min(1).max(80),
    qtyPerPack: z.number().int().min(1).max(100),
  })).min(1).max(20),
  allergensConfirmed: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  /** Staff must explicitly tick "I have checked allergens" — AI suggestions are never trusted. */
  allergenCheckDone: z.literal(true),
  preparedAt: z.number().int(),
  storage: z.enum(["ambient", "chilled", "hot_held"]),
  pickupStart: z.number().int(),
  pickupEnd: z.number().int(),
});
export type ApproveInput = z.infer<typeof approveSchema>;

/** Server-side guardrails applied regardless of what the AI or client suggested. */
export function validateApproval(input: ApproveInput, merchant: Merchant, now: number): void {
  const fs = merchant.foodSafety;
  if (input.channel === "sell") {
    if (!fs.allowedSaleCategories.includes(input.category)) throw bad("category_not_allowed", "This category isn't enabled for sale in your food-safety settings");
    const ratio = input.pricePerPack / input.originalPricePerPack;
    if (ratio < config.limits.priceFloorRatio || ratio > config.limits.priceCeilRatio) {
      throw bad("price_out_of_bounds", `Rescue price must be ${config.limits.priceFloorRatio * 100}–${config.limits.priceCeilRatio * 100}% of the original`);
    }
  } else if (!fs.donationEligibleCategories.includes(input.category)) {
    throw bad("not_donation_eligible", "This category isn't eligible for donation in your food-safety settings");
  }
  const maxH = fs.maxHoursSincePrep[input.category];
  if (input.preparedAt > now + 5 * 60_000) throw bad("prepared_in_future");
  if (maxH !== undefined && input.pickupEnd - input.preparedAt > maxH * 3_600_000) {
    throw bad("too_old", `Pickup must end within ${maxH} h of preparation for ${input.category}`);
  }
  if (input.pickupEnd <= input.pickupStart) throw bad("invalid_window", "Pickup end must be after start");
  if (input.pickupEnd <= now) throw bad("window_in_past");
  if (input.pickupEnd - input.pickupStart > 6 * 3_600_000) throw bad("window_too_long", "Pickup window can be at most 6 hours");
  const closeMin = hhmmToMinutes(merchant.pickupHours.close);
  const endMin = minutesOfDay(input.pickupEnd);
  if (dayKey(input.pickupEnd) === dayKey(now) && endMin > closeMin + 30) throw bad("after_closing", "Pickup must end by closing time");
}

export interface ApproveResult { kind: "offer" | "donation"; id: string }

/**
 * Turns an AI draft into a live offer or a donation after staff review.
 * Moves units out of live stock in the same transaction (no overselling).
 */
export async function approveDraft(draftId: string, input: ApproveInput, user: User, merchant: Merchant, now = Date.now()): Promise<ApproveResult> {
  validateApproval(input, merchant, now);
  const today = dayKey(now);
  return getStore().transaction(async (tx) => {
    // ---- reads ----
    const draft = await tx.get<SurplusDraft & { id: string }>(C.drafts, draftId);
    if (!draft || draft.merchantId !== merchant.id) throw notFound("Draft not found");
    if (draft.status !== "draft") throw conflict("already_reviewed", "This draft was already reviewed");
    const stockIds = [...new Set(input.items.map((i) => i.stockItemId).filter((x): x is string => !!x))];
    const stock = await Promise.all(stockIds.map((id) => tx.get<StockItem & { id: string }>(C.stock, id)));
    const day = (await tx.get<SalesDay & { id: string }>(C.salesDaily, salesDayId(merchant.id, today))) ?? emptySalesDay(merchant.id, today, now);

    // ---- writes ----
    const kind = input.channel === "sell" ? "rescued" : "donated";
    for (const [idx, id] of stockIds.entries()) {
      const s = stock[idx];
      if (!s || s.merchantId !== merchant.id) throw forbidden("Stock item doesn't belong to you");
      const qty = input.items.filter((i) => i.stockItemId === id).reduce((a, i) => a + i.qtyPerPack * input.packs, 0);
      takeForRescue(tx, rollToToday(s, today), day, qty, kind, now);
    }
    tx.set(C.salesDaily, day as SalesDay & { id: string });

    const editsCount = countEdits(draft, input);
    tx.update(C.drafts, draftId, { status: "approved", editsCount, reviewedBy: user.id, reviewedAt: now });

    const attestation = { preparedAt: input.preparedAt, storage: input.storage, attestedBy: user.id };
    if (input.channel === "sell") {
      const offer: Offer = {
        id: newId("off"), merchantId: merchant.id, merchantName: merchant.name, draftId,
        title: input.title, ...(input.titleHi ? { titleHi: input.titleHi } : {}),
        category: input.category, vegMark: input.vegMark,
        items: input.items.map((i) => ({ name: i.name, qty: i.qtyPerPack, ...(i.stockItemId ? { stockItemId: i.stockItemId } : {}) })),
        allergensConfirmed: input.allergensConfirmed,
        originalPrice: input.originalPricePerPack, price: input.pricePerPack,
        qtyTotal: input.packs, qtyAvailable: input.packs,
        pickupStart: input.pickupStart, pickupEnd: input.pickupEnd,
        location: merchant.location, geohash: merchant.geohash,
        status: "live", safetyAttestation: attestation, createdAt: now,
      };
      tx.set(C.offers, offer as Offer & { id: string });
      syncPublic(tx, offer);
      return { kind: "offer", id: offer.id };
    }
    const units = input.items.reduce((a, i) => a + i.qtyPerPack, 0) * input.packs;
    const donation: Donation = {
      id: newId("don"), merchantId: merchant.id, merchantName: merchant.name,
      items: input.items.map((i) => ({ name: i.name, qty: i.qtyPerPack * input.packs })),
      estimatedMeals: input.packs, estimatedKg: Math.round(units * 0.25 * 10) / 10,
      location: merchant.location, geohash: merchant.geohash,
      safetyAttestation: { ...attestation, allergens: input.allergensConfirmed },
      status: "offered", pickupWindow: { start: input.pickupStart, end: input.pickupEnd }, createdAt: now,
    };
    tx.set(C.donations, donation as Donation & { id: string });
    return { kind: "donation", id: donation.id };
  });
}

/** Rough "how many fields did staff change" metric for the AI acceptance KPI. */
export function countEdits(draft: SurplusDraft, input: ApproveInput): number {
  let edits = 0;
  const b = draft.bundles[0];
  const first = draft.items[0];
  if (b ? b.suggestedPrice !== input.pricePerPack : first && first.unitPrice !== input.pricePerPack) edits++;
  if (first && first.category !== input.category) edits++;
  if (draft.pickupWindow.start !== input.pickupStart || draft.pickupWindow.end !== input.pickupEnd) edits++;
  const suggested = new Set(draft.items.flatMap((i) => i.allergensSuspected));
  if (suggested.size !== input.allergensConfirmed.length || input.allergensConfirmed.some((a) => !suggested.has(a))) edits++;
  if (b && b.title !== input.title) edits++;
  return edits;
}

/** Merchant withdraws an offer; unreserved packs go back to live stock. */
export async function withdrawOffer(offerId: string, merchant: Merchant, now = Date.now()): Promise<void> {
  const today = dayKey(now);
  await getStore().transaction(async (tx) => {
    const offer = await tx.get<Offer & { id: string }>(C.offers, offerId);
    if (!offer || offer.merchantId !== merchant.id) throw notFound("Offer not found");
    if (offer.status !== "live" && offer.status !== "sold_out") throw conflict("not_live");
    const stockIds = offer.items.map((i) => i.stockItemId).filter((x): x is string => !!x);
    const stock = await Promise.all(stockIds.map((id) => tx.get<StockItem & { id: string }>(C.stock, id)));

    for (const [idx, s] of stock.entries()) {
      if (!s) continue;
      const per = offer.items.find((i) => i.stockItemId === stockIds[idx])?.qty ?? 0;
      const item = rollToToday(s, today);
      tx.set(C.stock, { ...item, remaining: item.remaining + per * offer.qtyAvailable, lastUpdatedAt: now } as StockItem & { id: string });
    }
    const next: Offer = { ...offer, status: "withdrawn", qtyAvailable: 0 };
    tx.set(C.offers, next as Offer & { id: string });
    syncPublic(tx, next);
  });
}

export async function nearbyPublicOffers(center: { lat: number; lng: number }, radiusKm: number, now = Date.now()) {
  const rows = await getStore().nearby<ReturnType<typeof toPublicOffer>>(C.publicOffers, center, radiusKm);
  return rows.filter((o) => o.pickupEnd > now && o.qtyAvailable > 0).slice(0, 100);
}
