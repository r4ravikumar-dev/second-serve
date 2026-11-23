import type { Merchant, Offer, Reservation, User } from "@/lib/types";
import { codeMatches, encryptCode, generateCode, hashCode, newId, normalizeCode, qrPayload } from "../codes";
import { config } from "../config";
import { bad, conflict, forbidden, notFound, tooMany } from "../http";
import { C, getStore } from "../store";
import { KG_PER_UNIT, readImpact, writeImpact } from "./impact";
import { syncPublic } from "./projection";

export async function reserve(user: User, offerId: string, qty: number, now = Date.now()) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 3) throw bad("invalid_quantity", "You can reserve 1–3 packs");
  const code = generateCode();
  const id = newId("res");

  await getStore().transaction(async (tx) => {
    const offer = await tx.get<Offer & { id: string }>(C.offers, offerId);
    const me = await tx.get<User & { id: string }>(C.users, user.id);
    if (!offer) throw notFound("Offer not found");
    if (!me) throw forbidden();
    if (offer.status !== "live" || offer.pickupEnd <= now) throw conflict("offer_unavailable", "This offer is no longer available");
    if (offer.qtyAvailable < qty) throw conflict("not_enough_left", `Only ${offer.qtyAvailable} left`);
    if (me.activeReservations >= config.limits.maxActiveReservations) {
      throw conflict("too_many_active", `You can hold at most ${config.limits.maxActiveReservations} reservations at a time`);
    }

    const qtyAvailable = offer.qtyAvailable - qty;
    const next: Offer = { ...offer, qtyAvailable, status: qtyAvailable === 0 ? "sold_out" : "live" };
    tx.set(C.offers, next as Offer & { id: string });
    syncPublic(tx, next);
    tx.update(C.users, me.id, { activeReservations: me.activeReservations + 1 });

    const res: Reservation = {
      id, offerId, merchantId: offer.merchantId, customerUid: me.id, qty, priceEach: offer.price,
      offerTitle: offer.title, merchantName: offer.merchantName,
      pickupStart: offer.pickupStart, pickupEnd: offer.pickupEnd,
      codeHash: hashCode(id, code), codeEnc: encryptCode(code), failedAttempts: 0, status: "reserved", createdAt: now,
    };
    tx.set(C.reservations, res as Reservation & { id: string });
  });

  // Verification uses the HMAC; the encrypted copy lets the owner see the code again.
  return { id, code, qr: qrPayload(id, code) };
}

export async function cancelReservation(user: User, reservationId: string, now = Date.now()): Promise<void> {
  await getStore().transaction(async (tx) => {
    const res = await tx.get<Reservation & { id: string }>(C.reservations, reservationId);
    if (!res || res.customerUid !== user.id) throw notFound("Reservation not found");
    if (res.status !== "reserved") throw conflict("not_cancellable");
    const offer = await tx.get<Offer & { id: string }>(C.offers, res.offerId);
    const me = await tx.get<User & { id: string }>(C.users, user.id);

    tx.update(C.reservations, res.id, { status: "cancelled" });
    if (me) tx.update(C.users, me.id, { activeReservations: Math.max(0, me.activeReservations - 1) });
    if (offer && (offer.status === "live" || offer.status === "sold_out") && offer.pickupEnd > now) {
      const next: Offer = { ...offer, qtyAvailable: offer.qtyAvailable + res.qty, status: "live" };
      tx.set(C.offers, next as Offer & { id: string });
      syncPublic(tx, next);
    }
  });
}

/** Rate limit wrong codes per merchant per hour (codes are 6 chars from a 31-symbol alphabet). */
async function noteFailedAttempt(merchantId: string, now: number): Promise<void> {
  const id = `pickup_${merchantId}_${Math.floor(now / 3_600_000)}`;
  const store = getStore();
  await store.transaction(async (tx) => {
    const doc = await tx.get<{ id: string; count: number }>(C.rateLimits, id);
    tx.set(C.rateLimits, { id, count: (doc?.count ?? 0) + 1 });
  });
}

async function assertNotRateLimited(merchantId: string, now: number): Promise<void> {
  const doc = await getStore().get<{ id: string; count: number }>(C.rateLimits, `pickup_${merchantId}_${Math.floor(now / 3_600_000)}`);
  if ((doc?.count ?? 0) >= 20) throw tooMany("Too many wrong codes. Try again in a little while.");
}

/**
 * Counter verification. Accepts the QR payload "<reservationId>.<code>" or the bare
 * 6-character code (matched against this merchant's open reservations).
 */
export async function verifyPickup(merchant: Merchant, staff: User, input: { code?: string; qr?: string }, now = Date.now()) {
  await assertNotRateLimited(merchant.id, now);
  const store = getStore();

  let target: (Reservation & { id: string }) | null = null;
  let code = "";
  if (input.qr) {
    const [rid, c] = input.qr.split(".");
    const res = rid ? await store.get<Reservation & { id: string }>(C.reservations, rid) : null;
    if (res && res.merchantId === merchant.id && c && codeMatches(res.id, c, res.codeHash)) { target = res; code = c; }
  } else if (input.code) {
    code = normalizeCode(input.code);
    if (code.length !== 6) throw bad("invalid_code", "Codes have 6 characters");
    const open = await store.query<Reservation & { id: string }>(C.reservations, {
      where: [{ field: "merchantId", op: "==", value: merchant.id }, { field: "status", op: "==", value: "reserved" }],
      limit: 500,
    });
    target = open.find((r) => codeMatches(r.id, code, r.codeHash)) ?? null;
  } else {
    throw bad("missing_code");
  }

  if (!target) {
    await noteFailedAttempt(merchant.id, now);
    throw bad("wrong_code", "That code doesn't match an open reservation");
  }

  return store.transaction(async (tx) => {
    const res = await tx.get<Reservation & { id: string }>(C.reservations, target!.id);
    if (!res || res.status !== "reserved") throw conflict("already_used", "This code was already used or cancelled");
    const customer = await tx.get<User & { id: string }>(C.users, res.customerUid);
    const impact = await readImpact(tx, merchant.id, now);

    tx.update(C.reservations, res.id, { status: "collected", collectedAt: now, verifiedBy: staff.id });
    if (customer) tx.update(C.users, customer.id, { activeReservations: Math.max(0, customer.activeReservations - 1) });
    writeImpact(tx, impact, { unitsRescued: res.qty, revenueRecovered: res.qty * res.priceEach, kgRescued: res.qty * KG_PER_UNIT });
    return { reservationId: res.id, offerTitle: res.offerTitle, qty: res.qty, amountDue: res.qty * res.priceEach };
  });
}
