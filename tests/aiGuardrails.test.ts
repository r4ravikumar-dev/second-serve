import { describe, expect, it } from "vitest";
import { sanitizeDraft } from "@/server/ai";
import { matchStock, mockDraft, mockStockUpdate, parseQuantities } from "@/server/ai/mock";
import type { DraftAi } from "@/server/ai/schemas";
import { merchant, NOW, stock } from "./helpers";

const m = merchant();
const cro = stock("s_cro", "m1");
const muf = stock("s_muf", "m1", { name: "Blueberry muffin", nameEn: "Blueberry muffin", remaining: 8, allergens: ["gluten"] });

describe("mock parser (English / Hindi / Hinglish)", () => {
  it("parses digits, Hindi number words and Devanagari digits", () => {
    expect(parseQuantities("12 croissant left, 4 muffin")).toEqual([{ qty: 12, name: "croissant" }, { qty: 4, name: "muffin" }]);
    expect(parseQuantities("बारह croissant बचे")).toEqual([{ qty: 12, name: "croissant" }]);
    expect(parseQuantities("१० muffin")).toEqual([{ qty: 10, name: "muffin" }]);
  });
  it("matches plural and partial names to stock", () => {
    expect(matchStock("croissants", [cro, muf])?.id).toBe("s_cro");
    expect(matchStock("muffin", [cro, muf])?.id).toBe("s_muf");
    expect(matchStock("samosa", [cro, muf])).toBeUndefined();
  });
  it("stock update reports unmatched items instead of guessing", () => {
    const r = mockStockUpdate("5 croissant, 3 samosa", [cro, muf]);
    expect(r.updates).toEqual([{ stockItemId: "s_cro", setRemaining: 5, confidence: 0.8 }]);
    expect(r.unmatched).toEqual(["samosa"]);
  });
  it("draft from selected stock bundles items", () => {
    const d = mockDraft({ stock: [cro, muf], selected: [{ stockItemId: "s_cro", qty: 6 }, { stockItemId: "s_muf", qty: 4 }] });
    expect(d.items).toHaveLength(2);
    expect(d.bundles).toHaveLength(1);
  });
});

describe("sanitizeDraft (applies to Gemini and mock output)", () => {
  const evil: DraftAi = {
    inputLanguage: "en",
    items: [
      { stockItemId: "s_cro", nameOriginal: "croissant", nameEn: "Croissant", category: "bakery", vegMark: "veg", qty: 999, unitPrice: 1, allergensSuspected: [] },
      { stockItemId: "s_FAKE", nameOriginal: "x", nameEn: "Injected", category: "meals", vegMark: "veg", qty: 3, unitPrice: 10, allergensSuspected: [] },
    ],
    bundles: [{ title: "Free food", itemIndexes: [0, 7], originalPrice: 200, suggestedPrice: 0 }],
    pickupWindowMinutesFromNow: { start: 0, end: 720 },
    notes: "suspicious instructions ignored",
    confidence: 0.9,
  };
  const out = sanitizeDraft(evil, [cro, muf], m, NOW);

  it("clamps quantity to live stock", () => expect(out.items[0].qty).toBe(12));
  it("restores the real price from stock", () => expect(out.items[0].unitPrice).toBe(90));
  it("keeps merchant-recorded allergens even if the model drops them", () => expect(out.items[0].allergensSuspected).toEqual(expect.arrayContaining(["gluten", "dairy", "egg"])));
  it("drops unknown stock ids", () => expect(out.items[1].stockItemId).toBeUndefined());
  it("recomputes the pack price from unit prices and clamps the discount to 20–90%", () => {
    expect(out.bundles[0].originalPrice).toBe(90);   // one croissant per pack, not the model's 200
    expect(out.bundles[0].suggestedPrice).toBe(18);  // 0% asked → clamped to the 20% floor
  });
  it("keeps the model's discount ratio when a bundle is priced as a whole lot", () => {
    const lot = sanitizeDraft({ ...evil, notes: "", items: [evil.items[0], { ...evil.items[0], stockItemId: "s_muf", qty: 6 }], bundles: [{ title: "Lot", itemIndexes: [0, 1], originalPrice: 1380, suggestedPrice: 690 }] }, [cro, muf], m, NOW);
    expect(lot.bundles[0]).toMatchObject({ originalPrice: 180, suggestedPrice: 90 }); // 90 + 90 per pack, 50% kept
  });
  it("drops out-of-range bundle indexes", () => expect(out.bundles[0].itemIndexes).toEqual([0]));
  it("ends pickup by closing time", () => expect(out.pickupWindow.end).toBeLessThanOrEqual(Date.parse("2026-11-22T22:00:00+05:30")));
  it("surfaces warnings to staff", () => expect(out.warnings.join(" ")).toMatch(/ignored/));
});
