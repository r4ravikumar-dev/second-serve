import type { Offer, PublicOffer } from "@/lib/types";
import { C, type Tx } from "../store";

/** Public projection for the live map: only fields safe for anyone to read. */
export function toPublicOffer(o: Offer): PublicOffer & { id: string } {
  return {
    id: o.id,
    title: o.title,
    ...(o.titleHi ? { titleHi: o.titleHi } : {}),
    category: o.category,
    vegMark: o.vegMark,
    price: o.price,
    originalPrice: o.originalPrice,
    qtyAvailable: o.qtyAvailable,
    pickupStart: o.pickupStart,
    pickupEnd: o.pickupEnd,
    merchantName: o.merchantName,
    allergens: o.allergensConfirmed,
    location: o.location,
    geohash: o.geohash,
  };
}

/** Keep publicOffers in step with the private offer (call inside a transaction). */
export function syncPublic(tx: Tx, offer: Offer): void {
  if (offer.status === "live" && offer.qtyAvailable > 0) tx.set(C.publicOffers, toPublicOffer(offer));
  else tx.delete(C.publicOffers, offer.id);
}
