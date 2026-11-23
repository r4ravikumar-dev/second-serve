import type { Impact } from "@/lib/types";
import { C, type Tx } from "../store";
import { monthKey } from "./time";

export const impactId = (merchantId: string, ts: number) => `${merchantId}_${monthKey(ts)}`;

export function emptyImpact(merchantId: string, ts: number): Impact {
  return {
    id: impactId(merchantId, ts), merchantId, month: monthKey(ts),
    unitsRescued: 0, revenueRecovered: 0, mealsDonated: 0, kgRescued: 0, noShows: 0, topWastedItems: {},
  };
}

/** Read inside a transaction (before any writes). */
export async function readImpact(tx: Tx, merchantId: string, ts: number): Promise<Impact> {
  return (await tx.get<Impact & { id: string }>(C.impact, impactId(merchantId, ts))) ?? emptyImpact(merchantId, ts);
}

export function writeImpact(tx: Tx, impact: Impact, delta: Partial<Omit<Impact, "id" | "merchantId" | "month" | "topWastedItems">> & { wasted?: Record<string, number> }): void {
  const next: Impact = { ...impact, topWastedItems: { ...impact.topWastedItems } };
  for (const k of ["unitsRescued", "revenueRecovered", "mealsDonated", "kgRescued", "noShows"] as const) {
    next[k] = Math.round(((next[k] ?? 0) + (delta[k] ?? 0)) * 100) / 100;
  }
  for (const [name, n] of Object.entries(delta.wasted ?? {})) next.topWastedItems[name] = (next.topWastedItems[name] ?? 0) + n;
  tx.set(C.impact, next as Impact & { id: string });
}

/** Rough pilot estimate used for kg and meal impact numbers (documented in README). */
export const KG_PER_UNIT = 0.25;
