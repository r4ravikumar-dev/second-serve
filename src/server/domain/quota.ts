import type { Merchant } from "@/lib/types";
import { config } from "../config";
import { tooMany } from "../http";
import { C, getStore } from "../store";
import { dayKey } from "./time";

const LIMIT = { drafts: config.limits.draftsPerDay, voice: config.limits.voicePerDay, licence: config.limits.licencePerDay } as const;

/** Per-merchant daily AI quota (cost guard). Throws 429 when exhausted. */
export async function consumeQuota(merchantId: string, kind: keyof typeof LIMIT, now = Date.now()): Promise<void> {
  const today = dayKey(now);
  await getStore().transaction(async (tx) => {
    const m = await tx.get<Merchant & { id: string }>(C.merchants, merchantId);
    if (!m) return;
    const q = m.aiQuota?.date === today ? m.aiQuota : { date: today, drafts: 0, voice: 0, licence: 0 };
    if (q[kind] >= LIMIT[kind]) throw tooMany(`Daily AI limit reached (${LIMIT[kind]}). It resets tomorrow.`);
    tx.update(C.merchants, merchantId, { aiQuota: { ...q, [kind]: q[kind] + 1 } });
  });
}
