import { z } from "zod";
import type { SurplusDraft } from "@/lib/types";
import { requireMerchant } from "@/server/auth";
import { approveDraft, approveSchema } from "@/server/domain/offers";
import { rejectDraft } from "@/server/domain/surplus";
import { notFound, parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

type Ctx = { params: Promise<{ draftId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { merchant } = await requireMerchant();
  const { draftId } = await params;
  const d = await getStore().get<SurplusDraft & { id: string }>(C.drafts, draftId);
  if (!d || d.merchantId !== merchant.id) throw notFound();
  return d;
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { merchant, user } = await requireMerchant();
  const { draftId } = await params;
  return approveDraft(draftId, await parseJson(req, approveSchema), user, merchant);
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { merchant, user } = await requireMerchant();
  const { draftId } = await params;
  const { reason } = await parseJson(req, z.object({ reason: z.string().max(200).default("") }));
  await rejectDraft(draftId, merchant, user, reason);
  return { ok: true };
});
