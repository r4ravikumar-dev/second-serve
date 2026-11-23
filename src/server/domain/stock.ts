import type { Merchant, SalesDay, StockItem } from "@/lib/types";
import { bad, conflict, notFound } from "../http";
import { C, getStore, type Tx } from "../store";
import { dayKey, hourOf, weekdayOf } from "./time";

export const salesDayId = (merchantId: string, date: string) => `${merchantId}_${date}`;

export function emptySalesDay(merchantId: string, date: string, ts: number): SalesDay {
  return { id: salesDayId(merchantId, date), merchantId, date, weekday: weekdayOf(ts), items: {} };
}

function ensureItemRow(day: SalesDay, itemId: string) {
  return (day.items[itemId] ??= { prepared: 0, soldByHour: Array(24).fill(0), leftover: 0, rescued: 0, donated: 0 });
}

/** A stock item seen on a new business day starts at zero (sweep also resets nightly). */
export function rollToToday(item: StockItem, today: string): StockItem {
  return item.date === today ? item : { ...item, date: today, preparedToday: 0, remaining: 0 };
}

export interface StockChange {
  setPrepared?: number;   // "we made N today": adds the difference to remaining
  setRemaining?: number;  // checkpoint: "N left now"
  delta?: number;         // +/- tap
}

/**
 * Applies a stock change in a transaction and records sell-through.
 * A decrease that isn't a rescue is counted as a sale in the current hour.
 */
export async function adjustStock(
  merchantId: string, itemId: string, change: StockChange, via: StockItem["updatedVia"], userId: string, now = Date.now(),
): Promise<StockItem> {
  const today = dayKey(now);
  return getStore().transaction(async (tx) => {
    const raw = await tx.get<StockItem & { id: string }>(C.stock, itemId);
    if (!raw || raw.merchantId !== merchantId) throw notFound("Stock item not found");
    const day = (await tx.get<SalesDay & { id: string }>(C.salesDaily, salesDayId(merchantId, today))) ?? emptySalesDay(merchantId, today, now);

    const item = rollToToday(raw, today);
    let prepared = item.preparedToday;
    let remaining = item.remaining;

    if (change.setPrepared !== undefined) {
      if (change.setPrepared < 0 || change.setPrepared > 10_000) throw bad("invalid_quantity");
      remaining = Math.max(0, remaining + (change.setPrepared - prepared));
      prepared = change.setPrepared;
    }
    if (change.setRemaining !== undefined) {
      if (change.setRemaining < 0 || change.setRemaining > 10_000) throw bad("invalid_quantity");
      remaining = change.setRemaining;
      if (remaining > prepared) prepared = remaining; // staff made more than recorded
    }
    if (change.delta !== undefined) {
      if (!Number.isInteger(change.delta) || Math.abs(change.delta) > 1000) throw bad("invalid_quantity");
      remaining = Math.max(0, remaining + change.delta);
      if (remaining > prepared) prepared = remaining;
    }

    const sold = Math.max(0, item.remaining - remaining);
    const row = ensureItemRow(day, itemId);
    row.prepared = prepared;
    if (sold > 0 && via !== "rescue") row.soldByHour[hourOf(now)] += sold;

    const next: StockItem = { ...item, preparedToday: prepared, remaining, lastUpdatedAt: now, lastUpdatedBy: userId, updatedVia: via };
    tx.set(C.stock, next as StockItem & { id: string });
    tx.set(C.salesDaily, day as SalesDay & { id: string });
    return next;
  });
}

/** Moves units from stock into an offer/donation (not a sale). Call inside a transaction after all reads. */
export function takeForRescue(tx: Tx, item: StockItem, day: SalesDay, qty: number, kind: "rescued" | "donated", now: number): void {
  if (qty > item.remaining) throw conflict("not_enough_stock", `Only ${item.remaining} ${item.name} left`);
  const row = ensureItemRow(day, item.id);
  row[kind] += qty;
  tx.set(C.stock, { ...item, remaining: item.remaining - qty, lastUpdatedAt: now, updatedVia: "rescue" } as StockItem & { id: string });
}

export async function listStock(merchantId: string, now = Date.now()): Promise<StockItem[]> {
  const today = dayKey(now);
  const items = await getStore().query<StockItem & { id: string }>(C.stock, { where: [{ field: "merchantId", op: "==", value: merchantId }] });
  return items.map((i) => rollToToday(i, today)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Last N same-weekday SalesDay docs for prediction. */
export async function sameWeekdayHistory(merchantId: string, now: number, weeks = 4): Promise<SalesDay[]> {
  const ids = Array.from({ length: weeks }, (_, i) => salesDayId(merchantId, dayKey(now - (i + 1) * 7 * 86_400_000)));
  const docs = await Promise.all(ids.map((id) => getStore().get<SalesDay & { id: string }>(C.salesDaily, id)));
  return docs.filter((d): d is SalesDay & { id: string } => !!d);
}

export type { Merchant };
