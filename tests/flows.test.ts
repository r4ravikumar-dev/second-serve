import { beforeEach, describe, expect, it } from "vitest";
import type { Donation, Offer, StockItem, User } from "@/lib/types";
import { claimDonation, confirmHandover, donationsForNgo } from "@/server/domain/donations";
import { approveDraft, type ApproveInput, withdrawOffer } from "@/server/domain/offers";
import { cancelReservation, reserve, verifyPickup } from "@/server/domain/reservations";
import { adjustStock } from "@/server/domain/stock";
import { createDraft } from "@/server/domain/surplus";
import { sweep } from "@/server/domain/sweep";
import { consumeQuota } from "@/server/domain/quota";
import { C } from "@/server/store";
import { freshWorld, NOW } from "./helpers";

let w: Awaited<ReturnType<typeof freshWorld>>;
beforeEach(async () => { w = await freshWorld(); });

const approval = (over: Partial<ApproveInput> = {}): ApproveInput => ({
  channel: "sell", title: "Croissant pack", category: "bakery", vegMark: "egg", packs: 3,
  originalPricePerPack: 180, pricePerPack: 80, items: [{ stockItemId: "s_cro", name: "Butter croissant", qtyPerPack: 2 }],
  allergensConfirmed: ["gluten", "dairy", "egg"], allergenCheckDone: true,
  preparedAt: NOW - 3_600_000, storage: "ambient", pickupStart: NOW, pickupEnd: NOW + 3_600_000, ...over,
});

async function publish(over: Partial<ApproveInput> = {}) {
  const d = await createDraft({ merchant: w.m, user: w.staff, source: "stock", selected: [{ stockItemId: "s_cro", qty: 6 }], now: NOW });
  return approveDraft(d.id, approval(over), w.staff, w.m, NOW);
}

describe("stock", () => {
  it("records sales by hour and never goes negative", async () => {
    const s = await adjustStock("m1", "s_cro", { delta: -5 }, "tap", "staff", NOW);
    expect(s.remaining).toBe(7);
    const s2 = await adjustStock("m1", "s_cro", { delta: -50 }, "tap", "staff", NOW);
    expect(s2.remaining).toBe(0);
    const day = await w.store.get<{ id: string; items: Record<string, { soldByHour: number[] }> }>(C.salesDaily, "m1_2026-11-22");
    expect(day!.items.s_cro.soldByHour[14]).toBe(12);
  });
  it("rejects other merchants' items", async () => {
    await expect(adjustStock("m2", "s_cro", { delta: 1 }, "tap", "x", NOW)).rejects.toThrow(/not found/i);
  });
});

describe("rescue → offer", () => {
  it("publishes an offer, moves stock, creates the public projection", async () => {
    const r = await publish();
    expect(r.kind).toBe("offer");
    expect((await w.store.get<StockItem & { id: string }>(C.stock, "s_cro"))!.remaining).toBe(6);
    const pub = await w.store.get<Record<string, unknown> & { id: string }>(C.publicOffers, r.id);
    expect(pub).toBeTruthy();
    expect(pub).not.toHaveProperty("safetyAttestation");
    expect(pub).not.toHaveProperty("merchantId");
  });
  it.each([
    ["price below floor", { pricePerPack: 10 }, /price/i],
    ["price above ceiling", { pricePerPack: 175 }, /price/i],
    ["category not allowed for donation", { channel: "donate" as const, category: "desserts" as const }, /donation/i],
    ["too long after preparation", { preparedAt: NOW - 30 * 3_600_000 }, /within/i],
    ["window in the past", { pickupStart: NOW - 7_200_000, pickupEnd: NOW - 3_600_000 }, /window|past/i],
  ])("refuses %s", async (_n, over, re) => {
    await expect(publish(over)).rejects.toThrow(re);
  });
  it("refuses more than is in stock", async () => {
    await expect(publish({ packs: 10 })).rejects.toThrow(/left/i);
  });
  it("withdraw returns unreserved packs to stock", async () => {
    const r = await publish();
    await withdrawOffer(r.id, w.m, NOW);
    expect((await w.store.get<StockItem & { id: string }>(C.stock, "s_cro"))!.remaining).toBe(12);
    expect(await w.store.get(C.publicOffers, r.id)).toBeNull();
  });
  it("respects the daily AI draft quota", async () => {
    for (let i = 0; i < 20; i++) await consumeQuota("m1", "drafts", NOW);
    await expect(consumeQuota("m1", "drafts", NOW)).rejects.toThrow(/limit/i);
  });
});

describe("reservations", () => {
  it("full happy path: reserve → verify at counter → impact", async () => {
    const { id: offerId } = await publish();
    const res = await reserve(w.customer, offerId, 2, NOW);
    const out = await verifyPickup(w.m, w.staff, { code: res.code }, NOW);
    expect(out.amountDue).toBe(160);
    const impact = await w.store.get<{ id: string; revenueRecovered: number; unitsRescued: number }>(C.impact, "m1_2026-11");
    expect(impact).toMatchObject({ revenueRecovered: 160, unitsRescued: 2 });
    await expect(verifyPickup(w.m, w.staff, { code: res.code }, NOW)).rejects.toThrow();
  });
  it("QR payload works and is merchant-bound", async () => {
    const { id: offerId } = await publish();
    const res = await reserve(w.customer, offerId, 1, NOW);
    await expect(verifyPickup({ ...w.m, id: "other" }, w.staff, { qr: res.qr }, NOW)).rejects.toThrow(/match/i);
    await expect(verifyPickup(w.m, w.staff, { qr: res.qr }, NOW)).resolves.toMatchObject({ qty: 1 });
  });
  it("concurrent reservations never oversell", async () => {
    const { id: offerId } = await publish({ packs: 3 });
    const users = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const u: User = { ...w.customer, id: `c${i}` };
      await w.store.set(C.users, u);
      return u;
    }));
    const results = await Promise.allSettled(users.map((u) => reserve(u, offerId, 1, NOW)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const offer = await w.store.get<Offer & { id: string }>(C.offers, offerId);
    expect(offer).toMatchObject({ qtyAvailable: 0, status: "sold_out" });
    expect(await w.store.get(C.publicOffers, offerId)).toBeNull();
  });
  it("caps active reservations per customer", async () => {
    const { id: offerId } = await publish({ packs: 3 });
    await reserve(w.customer, offerId, 1, NOW);
    await reserve(w.customer, offerId, 1, NOW);
    await expect(reserve(w.customer, offerId, 1, NOW)).rejects.toThrow(/at most 2/);
  });
  it("cancel restores availability and reopens a sold-out offer", async () => {
    const { id: offerId } = await publish({ packs: 1 });
    const r = await reserve(w.customer, offerId, 1, NOW);
    await cancelReservation(w.customer, r.id, NOW);
    expect(await w.store.get<Offer & { id: string }>(C.offers, offerId)).toMatchObject({ qtyAvailable: 1, status: "live" });
    expect(await w.store.get(C.publicOffers, offerId)).toBeTruthy();
  });
  it("rejects bad quantities and expired offers", async () => {
    const { id: offerId } = await publish();
    await expect(reserve(w.customer, offerId, 0, NOW)).rejects.toThrow();
    await expect(reserve(w.customer, offerId, 4, NOW)).rejects.toThrow();
    await expect(reserve(w.customer, offerId, 1, NOW + 2 * 3_600_000)).rejects.toThrow(/no longer/);
  });
  it("rate-limits wrong codes", async () => {
    for (let i = 0; i < 20; i++) await verifyPickup(w.m, w.staff, { code: "ZZZZZZ" }, NOW).catch(() => undefined);
    await expect(verifyPickup(w.m, w.staff, { code: "ZZZZZZ" }, NOW)).rejects.toThrow(/Too many/);
  });
});

describe("donations", () => {
  it("donate → first claim wins → two-sided handover", async () => {
    const r = await publish({ channel: "donate", pricePerPack: 0 });
    expect(r.kind).toBe("donation");
    const list = await donationsForNgo(w.n, NOW);
    expect(list.open.map((d) => d.id)).toContain(r.id);
    const { code } = await claimDonation(w.n, w.ngoUser, r.id, NOW);
    await expect(claimDonation({ ...w.n, id: "n2" }, w.ngoUser, r.id, NOW)).rejects.toThrow(/already/);
    await expect(confirmHandover(w.m, w.staff, r.id, "AAAAAA", NOW)).rejects.toThrow(/match/);
    await confirmHandover(w.m, w.staff, r.id, code, NOW);
    expect(await w.store.get<Donation & { id: string }>(C.donations, r.id)).toMatchObject({ status: "collected" });
  });
});

describe("sweep", () => {
  it("expires offers, marks no-shows, rolls stock and suspends expired licences", async () => {
    const { id: offerId } = await publish();
    await reserve(w.customer, offerId, 1, NOW);
    await w.store.update(C.merchants, "m1", { "verification.validUpto": "2026-01-01" });
    const later = NOW + 26 * 3_600_000; // next day
    const r = await sweep(later);
    expect(r).toMatchObject({ offersExpired: 1, noShows: 1, orgsSuspended: 1 });
    expect(r.stockRolled).toBeGreaterThanOrEqual(2);
    expect(await w.store.get<User & { id: string }>(C.users, "cust")).toMatchObject({ noShows: 1, activeReservations: 0 });
    expect(await w.store.get(C.publicOffers, offerId)).toBeNull();
    const again = await sweep(later);
    expect(again).toMatchObject({ offersExpired: 0, noShows: 0, stockRolled: 0 });
  });
});
