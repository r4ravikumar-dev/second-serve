import type { Donation, Merchant, Ngo, Offer, Reservation, SalesDay, StockItem, User } from "@/lib/types";
import { C, getStore } from "../store";
import { readImpact, writeImpact } from "./impact";
import { syncPublic } from "./projection";
import { emptySalesDay, salesDayId } from "./stock";
import { dayKey } from "./time";

export interface SweepResult {
  offersExpired: number;
  noShows: number;
  donationsExpired: number;
  stockRolled: number;
  orgsSuspended: number;
}

/**
 * Runs every 15 min from Cloud Scheduler (idempotent). Reads also filter by
 * time, so a missed run never shows stale offers.
 * Leftovers are NOT auto-donated: the merchant decides (human approval).
 */
export async function sweep(now = Date.now()): Promise<SweepResult> {
  const store = getStore();
  const today = dayKey(now);
  const r: SweepResult = { offersExpired: 0, noShows: 0, donationsExpired: 0, stockRolled: 0, orgsSuspended: 0 };

  // 1. Expire live offers past their pickup window; unreserved packs return to stock.
  const live = await store.query<Offer & { id: string }>(C.offers, { where: [{ field: "status", op: "in", value: ["live", "sold_out"] }], limit: 500 });
  for (const o of live.filter((x) => x.pickupEnd <= now)) {
    await store.transaction(async (tx) => {
      const offer = await tx.get<Offer & { id: string }>(C.offers, o.id);
      if (!offer || (offer.status !== "live" && offer.status !== "sold_out")) return;
      const stock = await Promise.all(offer.items.map((i) => (i.stockItemId ? tx.get<StockItem & { id: string }>(C.stock, i.stockItemId) : Promise.resolve(null))));
      offer.items.forEach((i, idx) => {
        const s = stock[idx];
        if (s && offer.qtyAvailable > 0 && s.date === dayKey(offer.pickupEnd)) {
          tx.set(C.stock, { ...s, remaining: s.remaining + i.qty * offer.qtyAvailable } as StockItem & { id: string });
        }
      });
      const next: Offer = { ...offer, status: "expired" };
      tx.set(C.offers, next as Offer & { id: string });
      syncPublic(tx, next);
    });
    r.offersExpired++;
  }

  // 2. Reservations not collected by the end of the window become no-shows.
  const open = await store.query<Reservation & { id: string }>(C.reservations, { where: [{ field: "status", op: "==", value: "reserved" }], limit: 500 });
  for (const res of open.filter((x) => x.pickupEnd + 15 * 60_000 <= now)) {
    await store.transaction(async (tx) => {
      const cur = await tx.get<Reservation & { id: string }>(C.reservations, res.id);
      if (!cur || cur.status !== "reserved") return;
      const user = await tx.get<User & { id: string }>(C.users, cur.customerUid);
      const impact = await readImpact(tx, cur.merchantId, now);
      tx.update(C.reservations, cur.id, { status: "no_show" });
      if (user) tx.update(C.users, user.id, { noShows: user.noShows + 1, activeReservations: Math.max(0, user.activeReservations - 1) });
      writeImpact(tx, impact, { noShows: 1 });
    });
    r.noShows++;
  }

  // 3. Donations past their window.
  const dons = await store.query<Donation & { id: string }>(C.donations, { where: [{ field: "status", op: "in", value: ["offered", "claimed"] }], limit: 500 });
  for (const d of dons.filter((x) => x.pickupWindow.end + 30 * 60_000 <= now)) {
    await store.update(C.donations, d.id, { status: "expired" });
    r.donationsExpired++;
  }

  // 4. Roll stock from previous days: record leftovers (waste) and reset.
  const stale = (await store.query<StockItem & { id: string }>(C.stock, { limit: 2000 })).filter((s) => s.date < today);
  for (const s of stale) {
    await store.transaction(async (tx) => {
      const item = await tx.get<StockItem & { id: string }>(C.stock, s.id);
      if (!item || item.date >= today) return;
      const day = (await tx.get<SalesDay & { id: string }>(C.salesDaily, salesDayId(item.merchantId, item.date))) ?? emptySalesDay(item.merchantId, item.date, item.lastUpdatedAt);
      const impact = await readImpact(tx, item.merchantId, item.lastUpdatedAt);
      const row = (day.items[item.id] ??= { prepared: item.preparedToday, soldByHour: Array(24).fill(0), leftover: 0, rescued: 0, donated: 0 });
      row.leftover = item.remaining;
      tx.set(C.salesDaily, day as SalesDay & { id: string });
      if (item.remaining > 0) writeImpact(tx, impact, { wasted: { [item.nameEn || item.name]: item.remaining } });
      tx.set(C.stock, { ...item, date: today, preparedToday: 0, remaining: 0 } as StockItem & { id: string });
    });
    r.stockRolled++;
  }

  // 5. Suspend organisations whose licence has expired.
  for (const col of [C.merchants, C.ngos] as const) {
    const verified = await store.query<(Merchant | Ngo) & { id: string }>(col, { where: [{ field: "verification.status", op: "==", value: "verified" }], limit: 500 });
    for (const org of verified.filter((o) => o.verification.validUpto && o.verification.validUpto < today)) {
      await store.update(col, org.id, { "verification.status": "suspended" });
      r.orgsSuspended++;
    }
  }

  console.log(JSON.stringify({ severity: "INFO", event: "sweep", message: "sweep completed", ...r }));
  return r;
}
