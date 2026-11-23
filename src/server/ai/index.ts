import type { Merchant, StockItem, SurplusDraft } from "@/lib/types";
import { config } from "../config";
import { hhmmToMinutes, minutesOfDay } from "../domain/time";
import { generateJson, type Media } from "./gemini";
import { mockDraft, mockLicence, mockStockUpdate } from "./mock";
import { draftSchema, licenceSchema, stockUpdateSchema, type DraftAi, type StockUpdateAi } from "./schemas";

const useMock = () => config.aiMode === "mock";

function stockContext(stock: StockItem[]): string {
  return JSON.stringify(stock.map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn, category: s.category, remaining: s.remaining, usualPrice: s.usualPrice, allergens: s.allergens })));
}

/** Escape so user text can't close the <input> tag. */
const wrap = (s: string) => `<input>${s.replace(/<\/?input>/gi, "")}</input>`;

// ---------------------------------------------------------------- surplus draft

export async function draftSurplus(args: {
  merchant: Merchant;
  stock: StockItem[];
  source: SurplusDraft["source"];
  selected?: { stockItemId: string; qty: number }[];
  text?: string;
  media?: Media;
  now: number;
}): Promise<{ ai: DraftAi; model: string }> {
  if (useMock()) return { ai: mockDraft({ stock: args.stock, selected: args.selected, text: args.text, hasMedia: !!args.media }), model: "mock" };
  const system = [
    "Task: turn a food business's surplus into a rescue-offer draft.",
    "Input may be English, Hindi (Devanagari) or Hinglish. Keep nameOriginal as given; give nameEn in English.",
    "Match items to the provided stock list by meaning (e.g. 'क्रोइसां' = croissant) and copy stockItemId when matched.",
    "Never exceed an item's 'remaining' quantity. Suggest 1–2 bundles ('surprise bags') when there are several items.",
    "suggestedPrice should be 40–60% of originalPrice. allergensSuspected: include allergens from the stock list plus any you suspect.",
    `The shop closes at ${args.merchant.pickupHours.close} (local). Pickup must end before closing.`,
  ].join("\n");
  const text = [
    `Stock list (trusted, from the app): ${stockContext(args.stock)}`,
    args.selected?.length ? `Staff selected these for rescue (trusted): ${JSON.stringify(args.selected)}` : "",
    args.text ? `Staff note: ${wrap(args.text)}` : "",
    args.media ? "An attachment (photo or voice note) from staff follows." : "",
  ].filter(Boolean).join("\n");
  return generateJson({ system, text, media: args.media ? [args.media] : undefined, schema: draftSchema })
    .then(({ data, model }) => ({ ai: data, model }));
}

/** Guardrails on any draft (mock or Gemini): clamp to stock, prices and opening hours. */
export function sanitizeDraft(ai: DraftAi, stock: StockItem[], merchant: Merchant, now: number) {
  const warnings: string[] = [];
  const byId = new Map(stock.map((s) => [s.id, s]));
  const items = ai.items.filter((i) => i.qty > 0).map((i) => {
    const s = i.stockItemId ? byId.get(i.stockItemId) : undefined;
    if (i.stockItemId && !s) warnings.push(`Unknown stock id dropped for "${i.nameEn}"`);
    let qty = i.qty;
    if (s && qty > s.remaining) { warnings.push(`${s.nameEn}: only ${s.remaining} in stock`); qty = s.remaining; }
    // Merchant-recorded allergens are always included; AI can only add, never remove.
    const allergens = [...new Set([...(s?.allergens ?? []), ...i.allergensSuspected])];
    return { ...i, stockItemId: s?.id, qty, unitPrice: s?.usualPrice ?? i.unitPrice, allergensSuspected: allergens };
  }).filter((i) => i.qty > 0);

  // A bundle "pack" = one of each item. Models sometimes price the whole lot, so the
  // original price is recomputed from unit prices and only the model's discount
  // ratio is kept (clamped to the allowed band).
  const lo = config.limits.priceFloorRatio, hi = config.limits.priceCeilRatio;
  const bundles = ai.bundles.map((b) => {
    const idx = [...new Set(b.itemIndexes.filter((x) => x < items.length))];
    const original = Math.max(1, idx.reduce((a, x) => a + items[x].unitPrice, 0));
    const aiRatio = b.originalPrice > 0 ? b.suggestedPrice / b.originalPrice : 0.5;
    const ratio = Math.min(hi, Math.max(lo, aiRatio));
    if (ratio !== aiRatio) warnings.push(`Discount for "${b.title}" adjusted to the allowed range`);
    const price = Math.min(Math.floor(original * hi), Math.max(Math.ceil(original * lo), Math.round(original * ratio)));
    return { ...b, itemIndexes: idx, originalPrice: original, suggestedPrice: price };
  }).filter((b) => b.itemIndexes.length > 0);

  const closeAt = now + (hhmmToMinutes(merchant.pickupHours.close) - minutesOfDay(now)) * 60_000;
  let start = now + ai.pickupWindowMinutesFromNow.start * 60_000;
  let end = now + ai.pickupWindowMinutesFromNow.end * 60_000;
  if (end > closeAt) { end = Math.max(now + 15 * 60_000, closeAt); warnings.push("Pickup window shortened to closing time"); }
  if (start >= end) start = Math.max(now, end - 30 * 60_000);
  if (/suspicious/i.test(ai.notes)) warnings.push("The input contained instructions that were ignored");

  return { items, bundles, pickupWindow: { start, end }, warnings, notes: ai.notes, confidence: ai.confidence, inputLang: ai.inputLanguage };
}

// ---------------------------------------------------------------- voice / text stock update

export async function parseStockUpdate(args: { stock: StockItem[]; text?: string; media?: Media }): Promise<{ result: StockUpdateAi; model: string }> {
  if (useMock()) return { result: mockStockUpdate(args.text, args.stock), model: "mock" };
  const system = [
    "Task: a shop worker is reporting how many of each item are LEFT (or a change like 'sold 3').",
    "Input may be Hindi, English or Hinglish, spoken or typed. Hindi number words count (बारह = 12).",
    "Only output updates for items in the provided stock list, using their exact ids. Put anything else in 'unmatched'.",
    "Use setRemaining for 'N left/बचे'; use delta for 'sold N' (negative) or 'made N more' (positive).",
  ].join("\n");
  const text = [`Stock list (trusted): ${stockContext(args.stock)}`, args.text ? `Worker said: ${wrap(args.text)}` : "The worker's voice note is attached."].join("\n");
  const { data, model } = await generateJson({ system, text, media: args.media ? [args.media] : undefined, schema: stockUpdateSchema, maxOutputTokens: 768 });
  const ids = new Set(args.stock.map((s) => s.id));
  return { result: { ...data, updates: data.updates.filter((u) => ids.has(u.stockItemId) && (u.setRemaining !== undefined || u.delta !== undefined)) }, model };
}

// ---------------------------------------------------------------- licence extraction

export async function extractLicence(args: {
  bytes: Buffer; mimeType: string; kind: "merchant" | "ngo"; path: string;
  hint?: { typedNumber: string; orgName: string };
}) {
  if (useMock()) {
    const ai = mockLicence({ typedNumber: args.hint?.typedNumber ?? "", orgName: args.hint?.orgName ?? "", kind: args.kind });
    return { ...ai, model: "mock" };
  }
  const system = args.kind === "merchant"
    ? "Task: read an Indian FSSAI food licence or registration certificate. Extract the 14-digit licence/registration number exactly as printed, the business name, and the 'valid upto' date as YYYY-MM-DD."
    : "Task: read an Indian NGO registration document (NGO Darpan, trust or society registration). Extract the registration/unique ID exactly as printed, the organisation name, and any expiry date as YYYY-MM-DD.";
  const media = { bytes: args.bytes, mimeType: args.mimeType };
  let { data, model } = await generateJson({ system, text: "Extract the fields from the attached document.", media: [media], schema: licenceSchema, maxOutputTokens: 512 });
  if (data.confidence < 0.6) {
    // Escalate only hard documents to the stronger model (cost control).
    ({ data, model } = await generateJson({ model: config.geminiEscalationModel, system, text: "Extract the fields from the attached document.", media: [media], schema: licenceSchema, maxOutputTokens: 512 }));
  }
  return { ...data, model };
}
