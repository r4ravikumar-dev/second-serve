import { describe, expect, it } from "vitest";
import { median, predictItem } from "@/server/domain/prediction";
import type { SalesDay } from "@/lib/types";
import { merchant, NOW, stock } from "./helpers";

const m = merchant();
const day = (soldPerHour: number, leftover: number): SalesDay => ({
  id: "x", merchantId: "m1", date: "2026-11-15", weekday: 0,
  items: { s_cro: { prepared: 30, soldByHour: Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 22 ? soldPerHour : 0)), leftover, rescued: 0, donated: 0 } },
});

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("predictItem", () => {
  it("flags an item selling slower than usual with plenty left (history basis)", () => {
    // usual: 2/hour → 28/day. At 14:00 usually 14 sold; today only 8 sold, 22 left.
    const item = stock("s_cro", "m1", { preparedToday: 30, remaining: 22 });
    const flag = predictItem(item, [day(2, 4), day(2, 6), day(2, 5)], m, NOW);
    expect(flag).not.toBeNull();
    expect(flag!.basis).toBe("history");
    expect(flag!.action).toBe("discount_now");
    expect(flag!.likelyLeftover).toBeGreaterThanOrEqual(3);
    expect(flag!.tomorrowReduceBy).toBe(5);
  });

  it("does not flag an item on track to sell out", () => {
    const item = stock("s_cro", "m1", { preparedToday: 30, remaining: 14 });
    expect(predictItem(item, [day(2, 0), day(2, 0)], m, NOW)).toBeNull();
  });

  it("uses the merchant estimate when there is no history (cold start)", () => {
    const item = stock("s_cro", "m1", { preparedToday: 40, remaining: 30, usualDailySales: 20 });
    const flag = predictItem(item, [], m, NOW);
    expect(flag?.basis).toBe("merchant_estimate");
  });

  it("returns null with neither history nor estimate", () => {
    expect(predictItem(stock("s_cro", "m1"), [], m, NOW)).toBeNull();
  });

  it("suggests donating near closing for donation-eligible categories", () => {
    const late = Date.parse("2026-11-22T21:30:00+05:30");
    const item = stock("s_cro", "m1", { preparedToday: 30, remaining: 20, usualDailySales: 10 });
    expect(predictItem(item, [], m, late)?.action).toBe("donate_at_close");
  });

  it("ignores sold-out items", () => {
    expect(predictItem(stock("s_cro", "m1", { remaining: 0, usualDailySales: 10 }), [], m, NOW)).toBeNull();
  });
});
