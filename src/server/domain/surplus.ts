import type { Merchant, SurplusDraft, User } from "@/lib/types";
import { draftSurplus, sanitizeDraft } from "../ai";
import type { Media } from "../ai/gemini";
import { newId } from "../codes";
import { bad, conflict, notFound } from "../http";
import { C, getStore } from "../store";
import { consumeQuota } from "./quota";
import { listStock } from "./stock";

/** Creates an AI draft (never published until staff approve it). */
export async function createDraft(args: {
  merchant: Merchant; user: User; source: SurplusDraft["source"];
  selected?: { stockItemId: string; qty: number }[]; text?: string; media?: Media; now?: number;
}): Promise<SurplusDraft> {
  const now = args.now ?? Date.now();
  if (!args.selected?.length && !args.text?.trim() && !args.media) throw bad("empty_input", "Select items, type a note, or attach a photo/voice note");
  await consumeQuota(args.merchant.id, "drafts", now);
  const stock = await listStock(args.merchant.id, now);
  const { ai, model } = await draftSurplus({ merchant: args.merchant, stock, source: args.source, selected: args.selected, text: args.text, media: args.media, now });
  const clean = sanitizeDraft(ai, stock, args.merchant, now);
  if (clean.items.length === 0) throw bad("nothing_found", "No items could be identified. Try again or type the items.");

  const draft: SurplusDraft = {
    id: newId("dft"), merchantId: args.merchant.id, createdBy: args.user.id, source: args.source,
    inputLang: clean.inputLang, items: clean.items, bundles: clean.bundles, pickupWindow: clean.pickupWindow,
    notes: clean.notes, confidence: clean.confidence, model, warnings: clean.warnings, status: "draft", createdAt: now,
  };
  await getStore().set(C.drafts, draft as SurplusDraft & { id: string });
  return draft;
}

export async function rejectDraft(draftId: string, merchant: Merchant, user: User, reason: string): Promise<void> {
  const store = getStore();
  const d = await store.get<SurplusDraft & { id: string }>(C.drafts, draftId);
  if (!d || d.merchantId !== merchant.id) throw notFound("Draft not found");
  if (d.status !== "draft") throw conflict("already_reviewed");
  await store.update(C.drafts, draftId, { status: "rejected", rejectReason: reason.slice(0, 200), reviewedBy: user.id, reviewedAt: Date.now() });
}
