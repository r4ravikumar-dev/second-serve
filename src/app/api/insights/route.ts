import type { Impact, SalesDay } from "@/lib/types";
import { requireMerchant } from "@/server/auth";
import { emptyImpact, impactId } from "@/server/domain/impact";
import { predictItem } from "@/server/domain/prediction";
import { listStock, salesDayId, sameWeekdayHistory } from "@/server/domain/stock";
import { dayKey } from "@/server/domain/time";
import { route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { merchant } = await requireMerchant();
  const store = getStore();
  const now = Date.now();
  const impact = (await store.get<Impact & { id: string }>(C.impact, impactId(merchant.id, now))) ?? emptyImpact(merchant.id, now);
  const keys = Array.from({ length: 14 }, (_, i) => dayKey(now - (13 - i) * 86_400_000));
  const days = await Promise.all(keys.map((k) => store.get<SalesDay & { id: string }>(C.salesDaily, salesDayId(merchant.id, k))));
  const trend = keys.map((date, i) => {
    const rows = Object.values(days[i]?.items ?? {});
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    return { date, sold: sum((r) => r.soldByHour.reduce((a, b) => a + b, 0)), rescued: sum((r) => r.rescued), donated: sum((r) => r.donated), leftover: sum((r) => r.leftover) };
  });
  const [items, history] = await Promise.all([listStock(merchant.id, now), sameWeekdayHistory(merchant.id, now)]);
  const atRisk = items.map((i) => predictItem(i, history, merchant, now)).filter(Boolean);
  const topWasted = Object.entries(impact.topWastedItems).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { impact, trend, atRisk, topWasted };
});
