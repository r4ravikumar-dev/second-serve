import type { Category, StockItem } from "@/lib/types";
import type { DraftAi, LicenceAi, StockUpdateAi } from "./schemas";

// Deterministic stand-in for Gemini so the app runs with zero cloud setup.
// It understands simple "<number> <item>" phrases in English, Hindi or Hinglish,
// using digits or Hindi number words. It cannot see photos or hear audio.

const HINDI_NUMBERS: Record<string, number> = {
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "ग्यारह": 11, "बारह": 12, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20,
};
const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function toNumber(tok: string): number | null {
  const ascii = tok.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  if (/^\d+$/.test(ascii)) return Number(ascii);
  return HINDI_NUMBERS[tok.toLowerCase()] ?? null;
}

const FILLER = new Set(["left", "remaining", "bache", "bacha", "बचे", "बचा", "हैं", "है", "and", "aur", "और", "we", "have", "only", "sirf", "सिर्फ"]);

/** Pairs of (number, following words) from free text. */
export function parseQuantities(text: string): { qty: number; name: string }[] {
  const toks = text.replace(/[,;.।\n]+/g, " , ").split(/\s+/).filter(Boolean);
  const out: { qty: number; name: string }[] = [];
  for (let i = 0; i < toks.length; i++) {
    const n = toNumber(toks[i]);
    if (n === null) continue;
    const words: string[] = [];
    for (let j = i + 1; j < toks.length && words.length < 3; j++) {
      if (toks[j] === "," || toNumber(toks[j]) !== null) break;
      if (!FILLER.has(toks[j].toLowerCase())) words.push(toks[j]);
    }
    if (words.length) out.push({ qty: n, name: words.join(" ") });
  }
  return out;
}

const singular = (s: string) => s.toLowerCase().replace(/(es|s)$/, "");

export function matchStock(name: string, stock: StockItem[]): StockItem | undefined {
  const n = singular(name);
  return stock.find((s) => [s.name, s.nameEn].some((x) => {
    const xs = singular(x);
    return xs.includes(n) || n.includes(xs) || xs.split(/\s+/).some((w) => w.length > 3 && n.includes(w));
  }));
}

const KEYWORDS: [Category, RegExp][] = [
  ["bakery", /bread|croissant|muffin|bun|cake|pastry|cookie|pav|ब्रेड|केक/i],
  ["desserts", /sweet|dessert|gulab|laddoo|ladoo|barfi|ice ?cream|मिठाई|लड्डू/i],
  ["beverages", /tea|coffee|juice|lassi|chai|चाय|कॉफी/i],
  ["fresh", /salad|fruit|sprout|सलाद|फल/i],
];
const guessCategory = (name: string): Category => KEYWORDS.find(([, re]) => re.test(name))?.[0] ?? "meals";

export function mockDraft(input: { stock: StockItem[]; selected?: { stockItemId: string; qty: number }[]; text?: string; hasMedia?: boolean }): DraftAi {
  let items: DraftAi["items"] = [];
  if (input.selected?.length) {
    items = input.selected.flatMap((sel) => {
      const s = input.stock.find((x) => x.id === sel.stockItemId);
      return s ? [{ stockItemId: s.id, nameOriginal: s.name, nameEn: s.nameEn, category: s.category, vegMark: s.vegMark, qty: sel.qty, unitPrice: s.usualPrice, allergensSuspected: s.allergens }] : [];
    });
  } else if (input.text) {
    items = parseQuantities(input.text).map(({ qty, name }) => {
      const s = matchStock(name, input.stock);
      return s
        ? { stockItemId: s.id, nameOriginal: s.name, nameEn: s.nameEn, category: s.category, vegMark: s.vegMark, qty, unitPrice: s.usualPrice, allergensSuspected: s.allergens }
        : { nameOriginal: name, nameEn: name, category: guessCategory(name), vegMark: "veg" as const, qty, unitPrice: 100, allergensSuspected: [] };
    });
  }
  if (items.length === 0 && input.hasMedia) {
    items = [{ nameOriginal: "Assorted items", nameEn: "Assorted items", category: "meals", vegMark: "veg", qty: 1, unitPrice: 150, allergensSuspected: [] }];
  }
  const bundles: DraftAi["bundles"] = [];
  if (items.length >= 2) {
    const original = items.slice(0, 3).reduce((a, i) => a + i.unitPrice, 0);
    bundles.push({ title: `Surprise bag: ${items.slice(0, 3).map((i) => i.nameEn).join(" + ")}`, itemIndexes: items.slice(0, 3).map((_, i) => i), originalPrice: original, suggestedPrice: Math.round(original * 0.5) });
  }
  const isHindi = /[ऀ-ॿ]/.test(input.text ?? "");
  return {
    inputLanguage: isHindi ? (/[a-z]/i.test(input.text ?? "") ? "mixed" : "hi") : "en",
    items,
    bundles,
    pickupWindowMinutesFromNow: { start: 30, end: 150 },
    notes: input.hasMedia && !input.text && !input.selected?.length ? "Mock AI can't read photos or audio — please edit the items." : "Mock AI suggestion",
    confidence: input.hasMedia ? 0.2 : 0.7,
  };
}

export function mockStockUpdate(text: string | undefined, stock: StockItem[]): StockUpdateAi {
  if (!text) return { inputLanguage: "unknown", transcript: "", updates: [], unmatched: ["Mock AI can't transcribe audio. Type the update instead, e.g. '12 croissant left'."] };
  const updates: StockUpdateAi["updates"] = [];
  const unmatched: string[] = [];
  for (const { qty, name } of parseQuantities(text)) {
    const s = matchStock(name, stock);
    if (s) updates.push({ stockItemId: s.id, setRemaining: qty, confidence: 0.8 });
    else unmatched.push(name);
  }
  return { inputLanguage: /[ऀ-ॿ]/.test(text) ? "hi" : "en", transcript: text, updates, unmatched };
}

/** Simulates a successful read using what the applicant typed (clearly labelled "mock"). */
export function mockLicence(hint: { typedNumber: string; orgName: string; kind: "merchant" | "ngo" }): LicenceAi {
  const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  return {
    documentType: hint.kind === "merchant" ? "fssai_state" : "ngo_registration",
    licenceNumber: hint.typedNumber,
    name: hint.orgName,
    validUpto: hint.kind === "merchant" ? nextYear : undefined,
    confidence: 0.5,
  };
}
