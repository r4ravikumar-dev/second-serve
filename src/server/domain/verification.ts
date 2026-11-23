import type { Merchant, Ngo, User, Verification } from "@/lib/types";
import { extractLicence } from "../ai";
import { readObject } from "../blob";
import { config } from "../config";
import { bad, conflict, forbidden, notFound } from "../http";
import { C, getStore } from "../store";
import { consumeQuota } from "./quota";
import { dayKey } from "./time";
import { runChecks } from "./verificationChecks";

/**
 * Submit a licence/registration document. Gemini extracts the fields, the server
 * runs checks, and the record goes to the admin queue as "auto_checked".
 * Nothing here can mark an organisation verified.
 */
export async function submitVerification(
  user: User, kind: "merchant" | "ngo", input: { docPath: string; typedNumber: string; mimeType: string }, now = Date.now(),
): Promise<Verification> {
  if (!user.orgId) throw forbidden("Create your business or NGO profile first");
  if (!input.docPath.startsWith(`licence/${user.orgId}/`)) throw forbidden("Document doesn't belong to you");
  const store = getStore();
  const col = kind === "merchant" ? C.merchants : C.ngos;
  const org = await store.get<(Merchant | Ngo) & { id: string }>(col, user.orgId);
  if (!org) throw notFound();
  if (org.verification.status === "verified") throw conflict("already_verified");

  if (kind === "merchant") await consumeQuota(org.id, "licence", now);

  const bytes = await readObject(input.docPath, config.limits.docMaxBytes);
  const ex = await extractLicence({ bytes, mimeType: input.mimeType, kind, path: input.docPath, hint: { typedNumber: input.typedNumber, orgName: org.name } });
  const checks = runChecks({
    kind: kind === "merchant" ? "fssai" : "ngo",
    typedNumber: input.typedNumber,
    extractedNumber: ex.licenceNumber,
    businessName: org.name,
    extractedName: ex.name,
    validUpto: ex.validUpto,
    todayKey: dayKey(now),
  });
  const v: Verification = {
    status: "auto_checked",
    documentType: ex.documentType,
    licenceNumber: ex.licenceNumber,
    licenceName: ex.name,
    ...(ex.validUpto ? { validUpto: ex.validUpto } : {}),
    docPath: input.docPath,
    checks,
    extractedBy: ex.model,
    submittedAt: now,
  };
  await store.update(col, org.id, { verification: v });
  return v;
}

/** The human decision. Admin only. */
export async function decideVerification(admin: User, kind: "merchant" | "ngo", orgId: string, approve: boolean, reason?: string, now = Date.now()) {
  if (admin.role !== "admin") throw forbidden();
  const col = kind === "merchant" ? C.merchants : C.ngos;
  const store = getStore();
  const org = await store.get<(Merchant | Ngo) & { id: string }>(col, orgId);
  if (!org) throw notFound();
  if (org.verification.status !== "auto_checked" && org.verification.status !== "suspended") {
    throw conflict("nothing_to_review", "No submitted document to review");
  }
  if (approve && org.verification.validUpto && org.verification.validUpto < dayKey(now)) {
    throw bad("expired_licence", "This licence has expired; ask for a renewed one");
  }
  if (!approve && !reason?.trim()) throw bad("reason_required", "Give a reason so the applicant can fix it");
  await store.update(col, orgId, {
    "verification.status": approve ? "verified" : "rejected",
    "verification.reviewedBy": admin.id,
    "verification.reviewedAt": now,
    ...(approve ? {} : { "verification.rejectReason": reason!.trim().slice(0, 300) }),
  });
}

export async function verificationQueue() {
  const store = getStore();
  const [m, n] = await Promise.all([
    store.query<Merchant & { id: string }>(C.merchants, { where: [{ field: "verification.status", op: "==", value: "auto_checked" }], limit: 50 }),
    store.query<Ngo & { id: string }>(C.ngos, { where: [{ field: "verification.status", op: "==", value: "auto_checked" }], limit: 50 }),
  ]);
  return [
    ...m.map((x) => ({ kind: "merchant" as const, id: x.id, name: x.name, verification: x.verification })),
    ...n.map((x) => ({ kind: "ngo" as const, id: x.id, name: x.name, verification: x.verification })),
  ];
}
