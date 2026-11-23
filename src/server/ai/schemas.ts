import { z } from "zod";
import { ALLERGENS, CATEGORIES } from "@/lib/types";

// Zod schemas double as the JSON Schema sent to Gemini (responseJsonSchema) and
// as the validator for whatever comes back. Model output is untrusted.

export const draftSchema = z.object({
  inputLanguage: z.enum(["en", "hi", "mixed", "unknown"]),
  items: z.array(z.object({
    stockItemId: z.string().max(64).optional().describe("Copy the id from the provided stock list when the item matches one; omit otherwise"),
    nameOriginal: z.string().max(80).describe("Item name as written or spoken (may be Hindi)"),
    nameEn: z.string().max(80).describe("English name"),
    category: z.enum(CATEGORIES),
    vegMark: z.enum(["veg", "nonveg", "egg"]),
    qty: z.number().int().min(0).max(500),
    unitPrice: z.number().min(0).max(100000).describe("Usual price per unit in INR if known, else best estimate"),
    allergensSuspected: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  })).max(20),
  bundles: z.array(z.object({
    title: z.string().max(80),
    titleHi: z.string().max(80).optional(),
    itemIndexes: z.array(z.number().int().min(0).max(19)).max(20),
    originalPrice: z.number().min(0).max(100000),
    suggestedPrice: z.number().min(0).max(100000),
  })).max(5),
  pickupWindowMinutesFromNow: z.object({ start: z.number().int().min(0).max(720), end: z.number().int().min(15).max(720) }),
  notes: z.string().max(300),
  confidence: z.number().min(0).max(1),
});
export type DraftAi = z.infer<typeof draftSchema>;

export const stockUpdateSchema = z.object({
  inputLanguage: z.enum(["en", "hi", "mixed", "unknown"]),
  transcript: z.string().max(500).describe("What the speaker said, verbatim"),
  updates: z.array(z.object({
    stockItemId: z.string().max(64).describe("Must be an id from the provided stock list"),
    setRemaining: z.number().int().min(0).max(10000).optional(),
    delta: z.number().int().min(-1000).max(1000).optional(),
    confidence: z.number().min(0).max(1),
  })).max(30),
  unmatched: z.array(z.string().max(80)).max(20).describe("Things mentioned that match no stock item"),
});
export type StockUpdateAi = z.infer<typeof stockUpdateSchema>;

export const licenceSchema = z.object({
  documentType: z.enum(["fssai_registration", "fssai_state", "fssai_central", "ngo_registration", "unknown"]),
  licenceNumber: z.string().max(40),
  name: z.string().max(120).describe("Business or organisation name on the document"),
  validUpto: z.string().max(10).optional().describe("Expiry date as YYYY-MM-DD, omit if none"),
  address: z.string().max(300).optional(),
  confidence: z.number().min(0).max(1),
});
export type LicenceAi = z.infer<typeof licenceSchema>;

// Numeric/length bounds multiply the decoding states and can exceed Gemini's schema
// complexity limit (HTTP 400). Gemini gets the structural schema (types, enums,
// required, descriptions); the full Zod schema still validates every response
// server-side, and sanitizeDraft() clamps quantities/prices afterwards.
const BOUND_KEYS = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems", "minLength", "maxLength", "$schema"]);

function stripBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripBounds);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).filter(([k]) => !BOUND_KEYS.has(k)).map(([k, v]) => [k, stripBounds(v)]));
  }
  return node;
}

export function jsonSchemaOf(schema: z.ZodType): unknown {
  return stripBounds(z.toJSONSchema(schema, { target: "draft-7" }));
}
