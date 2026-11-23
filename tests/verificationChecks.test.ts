import { describe, expect, it } from "vitest";
import { fssaiFormatOk, nameSimilarity, notExpired, numbersMatch, runChecks } from "@/server/domain/verificationChecks";

describe("licence checks", () => {
  it("accepts 14-digit FSSAI numbers only", () => {
    expect(fssaiFormatOk("21419012000123")).toBe(true);
    expect(fssaiFormatOk("2141 9012 0001 23")).toBe(true);
    expect(fssaiFormatOk("2141901200012")).toBe(false);
    expect(fssaiFormatOk("2141901200012A")).toBe(false);
  });
  it("matches typed vs extracted numbers ignoring spacing", () => {
    expect(numbersMatch("2141-9012-0001-23", "21419012000123", "fssai")).toBe(true);
    expect(numbersMatch("21419012000124", "21419012000123", "fssai")).toBe(false);
    expect(numbersMatch("ka/2019/0234567", "KA/2019/0234567", "ngo")).toBe(true);
  });
  it("checks expiry against today", () => {
    expect(notExpired("2026-11-22", "2026-11-22")).toBe(true);
    expect(notExpired("2026-11-21", "2026-11-22")).toBe(false);
    expect(notExpired(undefined, "2026-11-22")).toBe(false);
    expect(notExpired("22/11/2027", "2026-11-22")).toBe(false);
  });
  it("matches names despite 'Pvt Ltd' and word order", () => {
    expect(nameSimilarity("Crust & Crumb Bakery", "CRUST AND CRUMB BAKERY PVT LTD")).toBeGreaterThanOrEqual(0.5);
    expect(nameSimilarity("Annapurna Café", "Spice Route Kitchen")).toBeLessThan(0.5);
  });
  it("NGO documents without expiry pass the expiry check", () => {
    const c = runChecks({ kind: "ngo", typedNumber: "KA/2019/0234567", extractedNumber: "KA/2019/0234567", businessName: "Roti Bank", extractedName: "Roti Bank Trust", todayKey: "2026-11-22" });
    expect(c).toEqual({ formatOk: true, numberMatches: true, notExpired: true, nameMatches: true });
  });
});
