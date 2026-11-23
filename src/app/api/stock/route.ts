import { z } from "zod";
import { ALLERGENS, CATEGORIES, type StockItem } from "@/lib/types";
import { requireMerchant } from "@/server/auth";
import { newId } from "@/server/codes";
import { predictItem } from "@/server/domain/prediction";
import { listStock, sameWeekdayHistory } from "@/server/domain/stock";
import { dayKey } from "@/server/domain/time";
import { parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { merchant } = await requireMerchant();
  const now = Date.now();
  const [items, history] = await Promise.all([listStock(merchant.id, now), sameWeekdayHistory(merchant.id, now)]);
  const atRisk = items.map((i) => predictItem(i, history, merchant, now)).filter(Boolean);
  return { items, atRisk };
});

const create = z.object({
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  category: z.enum(CATEGORIES),
  vegMark: z.enum(["veg", "nonveg", "egg"]),
  unit: z.string().trim().min(1).max(20).default("pc"),
  usualPrice: z.number().min(1).max(100000),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  usualDailySales: z.number().int().min(0).max(10000).optional(),
});

export const POST = route(async (req) => {
  const { merchant, user } = await requireMerchant();
  const input = await parseJson(req, create);
  const now = Date.now();
  const item: StockItem = { id: newId("stk"), merchantId: merchant.id, ...input, date: dayKey(now), preparedToday: 0, remaining: 0, lastUpdatedAt: now, lastUpdatedBy: user.id, updatedVia: "set" };
  await getStore().set(C.stock, item);
  return item;
});
