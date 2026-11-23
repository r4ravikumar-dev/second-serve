import type { AtRiskFlag, Merchant, SalesDay, StockItem } from "@/lib/types";
import { hhmmToMinutes, minutesOfDay, minutesToHhmm } from "./time";

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Deterministic at-risk heuristic (DESIGN §5). `history` = same-weekday SalesDay
 * docs (most recent first, up to 4). Returns null when the item isn't at risk or
 * there's no basis for a prediction.
 */
export function predictItem(
  item: StockItem,
  history: SalesDay[],
  merchant: Pick<Merchant, "pickupHours" | "foodSafety">,
  now: number,
): AtRiskFlag | null {
  if (item.remaining <= 0) return null;

  const nowMin = minutesOfDay(now);
  const openMin = hhmmToMinutes(merchant.pickupHours.open);
  const closeMin = hhmmToMinutes(merchant.pickupHours.close);
  const hourIdx = Math.floor(nowMin / 60);
  const soldSoFar = Math.max(0, item.preparedToday - item.remaining);

  const days = history.map((d) => d.items[item.id]).filter(Boolean).slice(0, 4);
  let expectedRemainingSales: number;
  let basis: AtRiskFlag["basis"];

  if (days.length >= 2) {
    const totals = days.map((d) => sum(d.soldByHour));
    const byNow = days.map((d) => sum(d.soldByHour.slice(0, hourIdx + 1)));
    const expTotal = median(totals);
    const expByNow = median(byNow);
    // Pace: are we selling faster or slower than usual today? Clamped to avoid wild swings.
    const pace = expByNow > 0 ? Math.min(1.5, Math.max(0.5, soldSoFar / expByNow)) : 1;
    expectedRemainingSales = Math.max(0, (expTotal - expByNow) * pace);
    basis = "history";
  } else if (item.usualDailySales && item.usualDailySales > 0) {
    const span = Math.max(1, closeMin - openMin);
    const left = Math.min(1, Math.max(0, (closeMin - nowMin) / span));
    expectedRemainingSales = item.usualDailySales * left;
    basis = "merchant_estimate";
  } else {
    return null;
  }

  const likelyLeftover = Math.round(item.remaining - expectedRemainingSales);
  const threshold = Math.max(3, Math.ceil(0.2 * Math.max(item.preparedToday, item.remaining)));
  if (likelyLeftover < threshold) return null;

  const minutesToClose = closeMin - nowMin;
  let action: AtRiskFlag["action"];
  let suggestedDiscountAt: string | undefined;
  if (minutesToClose > 60) {
    action = "discount_now";
    suggestedDiscountAt = minutesToHhmm(Math.max(nowMin, closeMin - 120));
  } else if (merchant.foodSafety.donationEligibleCategories.includes(item.category)) {
    action = "donate_at_close";
  } else {
    action = "discount_now";
    suggestedDiscountAt = minutesToHhmm(nowMin);
  }

  const leftovers = days.map((d) => d.leftover);
  const tomorrowReduceBy = days.length >= 2 ? Math.round(median(leftovers)) : 0;

  return {
    stockItemId: item.id,
    name: item.name,
    remaining: item.remaining,
    expectedRemainingSales: Math.round(expectedRemainingSales),
    likelyLeftover,
    action,
    suggestedDiscountAt,
    basis,
    ...(tomorrowReduceBy >= 3 ? { tomorrowReduceBy } : {}),
  };
}
