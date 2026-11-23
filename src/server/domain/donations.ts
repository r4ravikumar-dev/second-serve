import type { Donation, Merchant, Ngo, User } from "@/lib/types";
import { codeMatches, decryptCode, encryptCode, generateCode, hashCode, normalizeCode } from "../codes";
import { bad, conflict, notFound } from "../http";
import { C, getStore } from "../store";
import { readImpact, writeImpact } from "./impact";

/** Donations visible to an NGO: open ones in its service area + the ones it claimed. */
export async function donationsForNgo(ngo: Ngo, now = Date.now()) {
  const store = getStore();
  const open = await store.nearby<Donation & { id: string }>(C.donations, ngo.serviceArea, ngo.serviceArea.radiusKm, [
    { field: "status", op: "==", value: "offered" },
  ]);
  const mine = await store.query<Donation & { id: string }>(C.donations, {
    where: [{ field: "claimedByNgo", op: "==", value: ngo.id }],
    limit: 50,
  });
  return {
    open: open.filter((d) => d.pickupWindow.end > now).map(stripHash),
    mine: mine.sort((a, b) => b.createdAt - a.createdAt).map((d) => ({ ...stripHash(d), handoverCode: d.status === "claimed" ? decryptCode(d.handoverCodeEnc) : null })),
  };
}

const stripHash = ({ handoverCodeHash: _h, handoverCodeEnc: _e, ...d }: Donation) => d;

/** First NGO to claim wins (transaction). Returns the handover code once. */
export async function claimDonation(ngo: Ngo, user: User, donationId: string, now = Date.now()) {
  const code = generateCode();
  await getStore().transaction(async (tx) => {
    const d = await tx.get<Donation & { id: string }>(C.donations, donationId);
    if (!d) throw notFound("Donation not found");
    if (d.status !== "offered") throw conflict("already_claimed", "Another partner already claimed this");
    if (d.pickupWindow.end <= now) throw conflict("expired", "The pickup window has passed");
    tx.update(C.donations, d.id, {
      status: "claimed", claimedByNgo: ngo.id, claimedByName: ngo.name, claimedBy: user.id,
      handoverCodeHash: hashCode(d.id, code), handoverCodeEnc: encryptCode(code), claimedAt: now,
    });
  });
  return { code };
}

/** Merchant types the NGO volunteer's code at handover: both sides confirmed. */
export async function confirmHandover(merchant: Merchant, staff: User, donationId: string, code: string, now = Date.now()) {
  if (normalizeCode(code).length !== 6) throw bad("invalid_code", "Codes have 6 characters");
  return getStore().transaction(async (tx) => {
    const d = await tx.get<Donation & { id: string }>(C.donations, donationId);
    if (!d || d.merchantId !== merchant.id) throw notFound("Donation not found");
    if (d.status !== "claimed" || !d.handoverCodeHash) throw conflict("not_claimed", "This donation hasn't been claimed yet");
    if (!codeMatches(d.id, code, d.handoverCodeHash)) throw bad("wrong_code", "That code doesn't match");
    const impact = await readImpact(tx, merchant.id, now);
    tx.update(C.donations, d.id, { status: "collected", merchantConfirmedAt: now, confirmedBy: staff.id });
    writeImpact(tx, impact, { mealsDonated: d.estimatedMeals, kgRescued: d.estimatedKg });
    return { donationId: d.id, ngo: d.claimedByName ?? "", meals: d.estimatedMeals };
  });
}

export async function donationsForMerchant(merchantId: string) {
  const rows = await getStore().query<Donation & { id: string }>(C.donations, {
    where: [{ field: "merchantId", op: "==", value: merchantId }], limit: 100,
  });
  return rows.sort((a, b) => b.createdAt - a.createdAt).map(stripHash);
}
